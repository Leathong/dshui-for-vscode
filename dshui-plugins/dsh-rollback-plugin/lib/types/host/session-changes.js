import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ok, fail } from "./errors.js";
import { sandboxPolicyFor } from "./fs-policy.js";
import { createdFileHunks, lineDiffHunks, normalizeLf } from "./ledger.js";
import { buildModificationsFromRecords, parseRecordArgs } from "./restore.js";
import { restoreModification } from "./modification.js";
/** Default bound on stored accept-time content; matches the ledger text bound. */
const DEFAULT_ACCEPT_CONTENT_MAX_BYTES = 256 * 1024;
/**
 * The session modification list: a live, session-wide diff against the
 * earliest session snapshot merged with ledger-covered tool changes, plus
 * accept markers and per-file / per-patch undo mutations.
 */
export class SessionChangeManager {
    ctx;
    snapshots;
    ledger;
    safety;
    accepts;
    options;
    bound = new Map();
    constructor(ctx, snapshots, ledger, safety, accepts, options) {
        this.ctx = ctx;
        this.snapshots = snapshots;
        this.ledger = ledger;
        this.safety = safety;
        this.accepts = accepts;
        this.options = options;
    }
    /** Bound (bytes) on accept-time content snapshots kept as later diff baselines. */
    get acceptContentMaxBytes() {
        return this.options.acceptContentMaxBytes ?? DEFAULT_ACCEPT_CONTENT_MAX_BYTES;
    }
    async sessionChanges(sessionId) {
        const live = this.liveSession(sessionId);
        if (!live.ok)
            return live;
        const session = live.value;
        const cwd = session.header.cwd;
        if (cwd === undefined) {
            return fail('session-not-live', `session "${sessionId}" has no workspace cwd`);
        }
        const manifests = await this.snapshots.listForSession(sessionId);
        const earliest = manifests[manifests.length - 1];
        const provider = this.snapshots.providerFor(cwd);
        const gitAvailable = await provider.available();
        const warnings = [];
        let preparedTree;
        let baselineUsable = false;
        let changes = [];
        if (earliest !== undefined && earliest.tree !== undefined && gitAvailable) {
            if (!(await this.snapshots.ensureTreeAvailable(earliest, provider))) {
                warnings.push('the session baseline snapshot objects have been garbage collected; only ledger-covered paths are shown');
            }
            else {
                baselineUsable = true;
                preparedTree = await provider.captureTree();
                const entries = await provider.diffEntries(earliest.tree, preparedTree);
                const ownWindows = await this.ownWindowPaths(sessionId, cwd, earliest.tree, preparedTree, entries, provider);
                const ledgerPaths = this.ledger.pathsForSession(sessionId, cwd);
                const foreignPaths = this.ledger.foreignPathsForSession(sessionId, cwd);
                // Hunks for modified/deleted/typechanged files are fetched in one git
                // process instead of one spawn per file.
                const deferredPaths = new Set();
                for (const entry of entries) {
                    if (entry.oldMode === '160000' || entry.newMode === '160000') {
                        warnings.push(entry.oldMode !== '160000'
                            ? `nested git repository "${entry.path}" appeared after the baseline snapshot; it is outside the list scope and will not be deleted or restored`
                            : `nested git repository "${entry.path}" is tracked as a gitlink; its internal changes are outside the list scope (only tool-written files inside it can be restored)`);
                        continue;
                    }
                    // Attribution: a path belongs to this session's list only when it
                    // changed during one of this session's own snapshot windows or is
                    // claimed by this session's ledger. Paths claimed solely by other
                    // sessions' ledgers never leak in, even when window attribution is
                    // unavailable or the other session left no snapshot behind.
                    const windowClaimed = ownWindows === undefined || ownWindows.has(entry.path);
                    const ledgerClaimed = ledgerPaths.has(entry.path);
                    if ((!windowClaimed && !ledgerClaimed) || (foreignPaths.has(entry.path) && !ledgerClaimed))
                        continue;
                    if (entry.status === 'A') {
                        const abs = provider.absolutePath(entry.path);
                        const hunks = await createdFileHunks(abs, this.options.maxDiffBytesPerFile);
                        changes.push({
                            path: entry.path,
                            absolutePath: abs,
                            status: 'created',
                            source: 'git',
                            restorable: false,
                            createdAfterSnapshot: true,
                            ...(hunks.length > 0 ? { hunks } : {}),
                        });
                        continue;
                    }
                    deferredPaths.add(entry.path);
                    changes.push({
                        path: entry.path,
                        absolutePath: provider.absolutePath(entry.path),
                        status: entry.status === 'D' ? 'deleted' : entry.status === 'T' ? 'typechange' : 'modified',
                        source: 'git',
                        restorable: true,
                    });
                }
                if (deferredPaths.size > 0) {
                    const diffMap = await provider.diffHunksBatched(earliest.tree, preparedTree, [...deferredPaths].sort())
                        .catch(() => undefined);
                    for (const change of changes) {
                        if (!deferredPaths.has(change.path))
                            continue;
                        const diff = diffMap?.get(change.path)
                            ?? await provider.diffHunks(earliest.tree, preparedTree, change.path);
                        if (diff.binary) {
                            change.binary = true;
                            if (change.status === 'modified')
                                change.status = 'binary';
                        }
                        if (diff.truncated)
                            change.truncated = true;
                        if (diff.hunks.length > 0)
                            change.hunks = diff.hunks;
                    }
                }
            }
        }
        else if (earliest !== undefined && earliest.tree !== undefined) {
            warnings.push('workspace is no longer inside a git work tree; only ledger-covered paths are shown');
        }
        if (earliest === undefined) {
            warnings.push('no session baseline snapshot yet; only ledger-covered tool modifications are listed');
        }
        const ledgerChanges = await this.ledger.buildSessionFileChanges(sessionId, cwd, gitAvailable && baselineUsable ? 'ignored' : 'fallback');
        const byPath = new Map();
        for (const change of changes)
            byPath.set(change.path, change);
        for (const change of ledgerChanges) {
            if (byPath.has(change.path))
                continue;
            byPath.set(change.path, change);
        }
        changes = [...byPath.values()];
        if (!gitAvailable) {
            warnings.push('workspace is not inside a git work tree; only tool write/edit modifications captured by the ledger can be restored');
        }
        const modifications = buildModificationsFromRecords(cwd, session.events, this.ledger.list(sessionId), record => this.ledger.laterModifications(sessionId, record.path, record));
        this.attachToolCalls(changes, modifications);
        // Reading a whole file only to hash it is the most expensive per-change
        // step, so fingerprint only files that actually have an accept record.
        for (const change of changes) {
            const record = this.accepts.fileRecord(sessionId, change.path);
            change.accepted = record === undefined ? false
                : record.fingerprint === undefined ? true
                    : this.accepts.fileAccepted(sessionId, change.path, await fingerprintOfAbs(change.absolutePath));
        }
        for (const modification of modifications) {
            modification.accepted = this.accepts.modificationAccepted(sessionId, modification.modificationId);
        }
        // A file accepted earlier and changed again re-enters the list; its diff
        // baseline must be the accepted content, not the earliest snapshot, so
        // only the post-accept changes are shown.
        for (const change of changes) {
            if (change.accepted === true)
                continue;
            const acceptedContent = this.accepts.acceptedContent(sessionId, change.path);
            if (acceptedContent === undefined)
                continue;
            await this.rebaseHunksOnAccepted(change, acceptedContent);
        }
        const listId = crypto.randomUUID();
        this.bound.set(listId, {
            listId,
            sessionId,
            cwd,
            ...(baselineUsable && earliest !== undefined ? { baseline: earliest } : {}),
            ...(preparedTree === undefined ? {} : { preparedTree }),
            gitAvailable,
            changes: changes.filter(change => change.accepted !== true),
            createdAt: Date.now(),
        });
        // Bound lists are tiny; keep only the most recent ones alive.
        while (this.bound.size > 32) {
            const oldest = this.bound.keys().next().value;
            if (oldest === undefined)
                break;
            this.bound.delete(oldest);
        }
        return ok({
            listId,
            ...(earliest === undefined ? {} : { baseline: baselineInfo(earliest, sessionStartTurn(session)) }),
            changes,
            modifications,
            acceptedFiles: this.accepts.acceptedFiles(sessionId),
            acceptedModifications: this.accepts.acceptedModifications(sessionId),
            warnings: [...new Set(warnings)],
        });
    }
    async acceptFile(request) {
        const bound = this.bound.get(request.listId);
        if (bound === undefined || bound.sessionId !== request.sessionId) {
            return fail('workspace-changed', 'the modification list is stale; refresh it and try again', { sessionId: request.sessionId });
        }
        const live = this.liveSession(request.sessionId);
        if (!live.ok)
            return live;
        const provider = this.snapshots.providerFor(bound.cwd);
        let rel;
        try {
            rel = provider.normalizeRelPath(request.path);
        }
        catch {
            return fail('path-not-in-snapshot', `path "${request.path}" is not a valid workspace path`, { sessionId: request.sessionId });
        }
        const acceptSnapshot = await acceptSnapshotOf(provider.absolutePath(rel), this.acceptContentMaxBytes);
        this.accepts.acceptFile(request.sessionId, rel, acceptSnapshot.fingerprint, acceptSnapshot.content);
        // Cascade: accepting a file accepts every patch attributed to it.
        for (const id of this.patchIdsForPath(live.value, bound.cwd, rel)) {
            this.accepts.acceptModification(request.sessionId, id);
        }
        return ok({
            acceptedFiles: this.accepts.acceptedFiles(request.sessionId),
            acceptedModifications: this.accepts.acceptedModifications(request.sessionId),
        });
    }
    async acceptModification(request) {
        const bound = this.bound.get(request.listId);
        if (bound === undefined || bound.sessionId !== request.sessionId) {
            return fail('workspace-changed', 'the modification list is stale; refresh it and try again', { sessionId: request.sessionId });
        }
        const live = this.liveSession(request.sessionId);
        if (!live.ok)
            return live;
        this.accepts.acceptModification(request.sessionId, request.modificationId);
        const provider = this.snapshots.providerFor(bound.cwd);
        let rel;
        try {
            rel = provider.normalizeRelPath(request.path);
        }
        catch {
            rel = undefined;
        }
        if (rel !== undefined) {
            const patchIds = this.patchIdsForPath(live.value, bound.cwd, rel);
            if (patchIds.length > 0 && patchIds.every(id => this.accepts.modificationAccepted(request.sessionId, id))) {
                const acceptSnapshot = await acceptSnapshotOf(provider.absolutePath(rel), this.acceptContentMaxBytes);
                this.accepts.acceptFile(request.sessionId, rel, acceptSnapshot.fingerprint, acceptSnapshot.content);
            }
        }
        return ok({
            acceptedFiles: this.accepts.acceptedFiles(request.sessionId),
            acceptedModifications: this.accepts.acceptedModifications(request.sessionId),
        });
    }
    async undoFile(request) {
        const bound = this.bound.get(request.listId);
        if (bound === undefined || bound.sessionId !== request.sessionId) {
            return fail('workspace-changed', 'the modification list is stale; refresh it and try again', { sessionId: request.sessionId });
        }
        const live = this.liveSession(request.sessionId);
        if (!live.ok)
            return live;
        const session = live.value;
        const policy = sandboxPolicyFor(this.ctx, session);
        const provider = this.snapshots.providerFor(bound.cwd);
        let rel;
        try {
            rel = provider.normalizeRelPath(request.path);
        }
        catch {
            return fail('path-not-in-snapshot', `path "${request.path}" is not a valid workspace path`, { sessionId: request.sessionId });
        }
        let guardId = '';
        let journalId;
        let acquired = false;
        try {
            if (bound.preparedTree !== undefined) {
                const guardTree = await provider.captureTree();
                if (guardTree !== bound.preparedTree) {
                    return fail('workspace-changed', 'the workspace changed after the list was read; refresh it and try again', { sessionId: request.sessionId });
                }
            }
            await this.safety.acquire(bound.cwd);
            acquired = true;
            await this.safety.assertFences(this.ctx, bound.cwd, provider);
            await this.ctx.sessions.flush(session);
            guardId = (await this.safety.captureGuard(this.ctx, provider, bound.cwd, bound.preparedTree, [rel], this.ledger)).guardId;
            journalId = (await this.safety.journalStart(guardId, [rel])).id;
            const restored = [];
            const deleted = [];
            const kept = [];
            const skipped = [];
            try {
                const baseline = bound.baseline;
                if (baseline !== undefined && baseline.tree !== undefined) {
                    const inSnapshot = (await provider.pathsInTree(baseline.tree, rel)).includes(rel);
                    if (inSnapshot) {
                        await provider.restorePaths(baseline.tree, [rel]);
                        const expected = await provider.blobHash(baseline.tree, rel);
                        const actual = await provider.fileHash(rel);
                        if (expected !== actual)
                            throw new Error(`verification failed for ${rel}`);
                        restored.push(rel);
                    }
                    else {
                        const abs = provider.absolutePath(rel);
                        if (!fs.existsSync(abs))
                            skipped.push(rel);
                        else {
                            fs.rmSync(abs, { force: true });
                            deleted.push(rel);
                        }
                    }
                }
                else {
                    const earliest = this.ledger.earliestForSessionPath(request.sessionId, provider.absolutePath(rel));
                    if (earliest === undefined) {
                        throw new Error(`no ledger baseline is available for ${rel}`);
                    }
                    const outcome = await this.ledger.restoreLedgerPath(bound.cwd, rel, earliest, 'delete', policy);
                    if (outcome === 'restored')
                        restored.push(rel);
                    else if (outcome === 'deleted')
                        deleted.push(rel);
                    else if (outcome === 'kept')
                        kept.push(rel);
                    else
                        skipped.push(rel);
                }
                await this.safety.journalUpdate(journalId, 'completed');
                // Undoing is itself an accept: the restored state leaves the default list.
                const acceptSnapshot = await acceptSnapshotOf(provider.absolutePath(rel), this.acceptContentMaxBytes);
                this.accepts.acceptFile(request.sessionId, rel, acceptSnapshot.fingerprint, acceptSnapshot.content);
                return ok({
                    guardId,
                    restored,
                    deleted,
                    kept,
                    skipped,
                    acceptedFiles: this.accepts.acceptedFiles(request.sessionId),
                });
            }
            catch (error) {
                await this.safety.rollbackGuard(this.ctx, provider, this.ledger, guardId, [rel], policy).catch(() => undefined);
                await this.safety.journalUpdate(journalId, 'rolled-back').catch(() => undefined);
                const code = error instanceof Error && error.message.startsWith('verification failed') ? 'verification-failed' : 'rollback-failed';
                return fail(code, String(error), { sessionId: request.sessionId, paths: [rel] });
            }
        }
        catch (error) {
            return this.mutationFailure(error, request.sessionId, bound, guardId, journalId, [rel], policy);
        }
        finally {
            if (acquired)
                await this.safety.release();
        }
    }
    async undoModification(request) {
        const bound = this.bound.get(request.listId);
        if (bound === undefined || bound.sessionId !== request.sessionId) {
            return fail('workspace-changed', 'the modification list is stale; refresh it and try again', { sessionId: request.sessionId });
        }
        const live = this.liveSession(request.sessionId);
        if (!live.ok)
            return live;
        const session = live.value;
        const policy = sandboxPolicyFor(this.ctx, session);
        const record = this.ledger.recordById(request.sessionId, request.modificationId);
        if (record === undefined) {
            return fail('rollback-failed', `modification "${request.modificationId}" has no live ledger record; refresh the list and undo at file level instead`, { sessionId: request.sessionId });
        }
        const provider = this.snapshots.providerFor(bound.cwd);
        let rel;
        try {
            rel = provider.normalizeRelPath(path.relative(bound.cwd, record.path));
        }
        catch {
            return fail('path-not-in-snapshot', 'the modification path is outside the workspace', { sessionId: request.sessionId });
        }
        let guardId = '';
        let journalId;
        let acquired = false;
        try {
            if (bound.preparedTree !== undefined) {
                const guardTree = await provider.captureTree();
                if (guardTree !== bound.preparedTree) {
                    return fail('workspace-changed', 'the workspace changed after the list was read; refresh it and try again', { sessionId: request.sessionId });
                }
            }
            await this.safety.acquire(bound.cwd);
            acquired = true;
            await this.safety.assertFences(this.ctx, bound.cwd, provider);
            await this.ctx.sessions.flush(session);
            const fileGuard = await this.ledger.readCurrentForGuard(bound.cwd, rel);
            guardId = (await this.safety.captureGuard(this.ctx, provider, bound.cwd, bound.preparedTree, [rel], this.ledger)).guardId;
            journalId = (await this.safety.journalStart(guardId, [rel])).id;
            try {
                const outcome = await restoreModification(this.ctx, this.ledger, bound.cwd, record, true, this.options.spawnTimeoutMs, policy);
                const results = [{
                        modificationId: record.modificationId,
                        path: rel,
                        status: outcome.status,
                        ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
                    }];
                if (outcome.status === 'conflict' || outcome.status === 'failed' || outcome.status === 'unsupported') {
                    await this.ledger.restoreGuardFile(bound.cwd, rel, fileGuard, policy).catch(() => undefined);
                    await this.safety.journalUpdate(journalId, 'rolled-back').catch(() => undefined);
                    return fail('rollback-failed', outcome.detail ?? `undo failed with status ${outcome.status}`, { sessionId: request.sessionId, paths: [rel] });
                }
                await this.safety.journalUpdate(journalId, 'completed');
                this.accepts.acceptModification(request.sessionId, record.modificationId);
                const patchIds = this.patchIdsForPath(session, bound.cwd, rel);
                if (patchIds.length > 0 && patchIds.every(id => this.accepts.modificationAccepted(request.sessionId, id))) {
                    this.accepts.acceptFile(request.sessionId, rel, await fingerprintOfAbs(provider.absolutePath(rel)));
                }
                return ok({
                    guardId,
                    modificationResults: results,
                    acceptedModifications: this.accepts.acceptedModifications(request.sessionId),
                });
            }
            catch (error) {
                await this.safety.rollbackGuard(this.ctx, provider, this.ledger, guardId, [rel], policy).catch(() => undefined);
                await this.safety.journalUpdate(journalId, 'rolled-back').catch(() => undefined);
                return fail('rollback-failed', String(error), { sessionId: request.sessionId, paths: [rel] });
            }
        }
        catch (error) {
            return this.mutationFailure(error, request.sessionId, bound, guardId, journalId, [rel], policy);
        }
        finally {
            if (acquired)
                await this.safety.release();
        }
    }
    /**
     * Paths that changed during this session's own activity windows. Every
     * snapshot this session captured opens a window that closes at the next
     * snapshot captured by any session in the same workspace (treeless
     * manifests extend the window); the last window ends at the current
     * worktree. Changes outside these windows belong to other sessions and
     * must not appear in this session's list. Returns undefined when window
     * attribution is impossible (no own snapshot in the workspace timeline,
     * or snapshot objects were garbage collected) — partial attribution
     * would hide the session's own changes, which is worse than showing
     * foreign ones.
     */
    async ownWindowPaths(sessionId, cwd, baselineTree, preparedTree, preparedEntries, provider) {
        const timeline = await this.snapshots.listForWorkspace(cwd);
        const own = new Set();
        let found = false;
        for (let index = 0; index < timeline.length; index += 1) {
            const manifest = timeline[index];
            if (manifest.sessionId !== sessionId || manifest.tree === undefined)
                continue;
            found = true;
            const endTrees = [];
            for (let next = index + 1; next < timeline.length; next += 1) {
                const tree = timeline[next].tree;
                if (tree !== undefined && tree !== manifest.tree && !endTrees.includes(tree))
                    endTrees.push(tree);
            }
            if (preparedTree !== manifest.tree && !endTrees.includes(preparedTree))
                endTrees.push(preparedTree);
            if (endTrees.length === 0)
                continue;
            let entries;
            if (manifest.tree === baselineTree && endTrees[0] === preparedTree) {
                entries = preparedEntries;
            }
            else {
                for (const endTree of endTrees) {
                    entries = await provider.diffEntries(manifest.tree, endTree).catch(() => undefined);
                    if (entries !== undefined)
                        break;
                }
            }
            if (entries === undefined)
                return undefined;
            for (const entry of entries)
                own.add(entry.path);
        }
        return found ? own : undefined;
    }
    liveSession(sessionId) {
        const session = this.ctx.sessions.get(sessionId);
        if (session === undefined)
            return fail('session-not-found', `session "${sessionId}" is not live`, { sessionId });
        return ok(session);
    }
    /** Accept every unaccepted file of the bound list (with patch cascades). */
    async acceptAll(request) {
        const bound = this.bound.get(request.listId);
        if (bound === undefined || bound.sessionId !== request.sessionId) {
            return fail('workspace-changed', 'the modification list is stale; refresh it and try again', { sessionId: request.sessionId });
        }
        const live = this.liveSession(request.sessionId);
        if (!live.ok)
            return live;
        const session = live.value;
        for (const change of bound.changes) {
            const acceptSnapshot = await acceptSnapshotOf(change.absolutePath, this.acceptContentMaxBytes);
            this.accepts.acceptFile(request.sessionId, change.path, acceptSnapshot.fingerprint, acceptSnapshot.content);
            for (const id of this.patchIdsForPath(session, bound.cwd, change.path)) {
                this.accepts.acceptModification(request.sessionId, id);
            }
        }
        return ok({
            acceptedFiles: this.accepts.acceptedFiles(request.sessionId),
            acceptedModifications: this.accepts.acceptedModifications(request.sessionId),
        });
    }
    /** Undo every unaccepted file of the bound list back to the session baseline. */
    async undoAll(request) {
        const bound = this.bound.get(request.listId);
        if (bound === undefined || bound.sessionId !== request.sessionId) {
            return fail('workspace-changed', 'the modification list is stale; refresh it and try again', { sessionId: request.sessionId });
        }
        const live = this.liveSession(request.sessionId);
        if (!live.ok)
            return live;
        const session = live.value;
        const policy = sandboxPolicyFor(this.ctx, session);
        const provider = this.snapshots.providerFor(bound.cwd);
        const changes = bound.changes;
        if (changes.length === 0) {
            return ok({
                guardId: '',
                restored: [],
                deleted: [],
                kept: [],
                skipped: [],
                acceptedFiles: this.accepts.acceptedFiles(request.sessionId),
            });
        }
        const rels = changes.map(change => change.path);
        const gitChanges = changes.filter(change => change.source === 'git');
        const ledgerChanges = changes.filter(change => change.source === 'ledger');
        const baseline = bound.baseline;
        let guardId = '';
        let journalId;
        let acquired = false;
        try {
            if (bound.preparedTree !== undefined) {
                const guardTree = await provider.captureTree();
                if (guardTree !== bound.preparedTree) {
                    return fail('workspace-changed', 'the workspace changed after the list was read; refresh it and try again', { sessionId: request.sessionId });
                }
            }
            await this.safety.acquire(bound.cwd);
            acquired = true;
            await this.safety.assertFences(this.ctx, bound.cwd, provider);
            await this.ctx.sessions.flush(session);
            guardId = (await this.safety.captureGuard(this.ctx, provider, bound.cwd, bound.preparedTree, ledgerChanges.map(change => change.path), this.ledger)).guardId;
            journalId = (await this.safety.journalStart(guardId, rels)).id;
            const restored = [];
            const deleted = [];
            const kept = [];
            const skipped = [];
            try {
                if (gitChanges.length > 0) {
                    if (baseline === undefined || baseline.tree === undefined) {
                        throw new Error('no baseline snapshot is available for git-tracked paths');
                    }
                    const inSnapshot = [];
                    const created = [];
                    for (const change of gitChanges) {
                        const included = (await provider.pathsInTree(baseline.tree, change.path)).includes(change.path);
                        if (included)
                            inSnapshot.push(change.path);
                        else
                            created.push(change.path);
                    }
                    if (inSnapshot.length > 0) {
                        await provider.restorePaths(baseline.tree, inSnapshot);
                        for (const rel of inSnapshot) {
                            const expected = await provider.blobHash(baseline.tree, rel);
                            const actual = await provider.fileHash(rel);
                            if (expected !== actual)
                                throw new Error(`verification failed for ${rel}`);
                            restored.push(rel);
                        }
                    }
                    for (const rel of created) {
                        const abs = provider.absolutePath(rel);
                        if (!fs.existsSync(abs))
                            skipped.push(rel);
                        else {
                            fs.rmSync(abs, { force: true });
                            deleted.push(rel);
                        }
                    }
                }
                for (const change of ledgerChanges) {
                    const earliest = this.ledger.earliestForSessionPath(request.sessionId, provider.absolutePath(change.path));
                    if (earliest === undefined) {
                        throw new Error(`no ledger baseline is available for ${change.path}`);
                    }
                    const outcome = await this.ledger.restoreLedgerPath(bound.cwd, change.path, earliest, 'delete', policy);
                    if (outcome === 'restored')
                        restored.push(change.path);
                    else if (outcome === 'deleted')
                        deleted.push(change.path);
                    else if (outcome === 'kept')
                        kept.push(change.path);
                    else
                        skipped.push(change.path);
                }
                await this.safety.journalUpdate(journalId, 'completed');
                // Undoing is itself an accept: the restored state leaves the default list.
                for (const rel of rels) {
                    const acceptSnapshot = await acceptSnapshotOf(provider.absolutePath(rel), this.acceptContentMaxBytes);
                    this.accepts.acceptFile(request.sessionId, rel, acceptSnapshot.fingerprint, acceptSnapshot.content);
                }
                return ok({
                    guardId,
                    restored,
                    deleted,
                    kept,
                    skipped,
                    acceptedFiles: this.accepts.acceptedFiles(request.sessionId),
                });
            }
            catch (error) {
                await this.safety.rollbackGuard(this.ctx, provider, this.ledger, guardId, rels, policy).catch(() => undefined);
                await this.safety.journalUpdate(journalId, 'rolled-back').catch(() => undefined);
                const code = error instanceof Error && error.message.startsWith('verification failed') ? 'verification-failed' : 'rollback-failed';
                return fail(code, String(error), { sessionId: request.sessionId, paths: rels });
            }
        }
        catch (error) {
            return this.mutationFailure(error, request.sessionId, bound, guardId, journalId, rels, policy);
        }
        finally {
            if (acquired)
                await this.safety.release();
        }
    }
    attachToolCalls(changes, modifications) {
        for (const change of changes) {
            const calls = modifications.filter(item => item.path === change.path);
            if (calls.length === 0)
                continue;
            change.toolCalls = calls.map(item => ({
                callId: item.modificationId,
                toolName: item.toolName,
                turn: item.turn,
                step: item.step,
                seq: item.seq,
                hunks: item.hunks,
            }));
        }
    }
    /** Every write/edit patch id (ledger + session-log only) attributed to a path. */
    patchIdsForPath(session, cwd, rel) {
        const ids = new Set();
        const abs = path.resolve(cwd, rel);
        for (const record of this.ledger.recordsForPath(session.id, abs))
            ids.add(record.modificationId);
        for (const event of session.events) {
            if (event.type !== 'tool/call')
                continue;
            const data = event.data;
            if (data.callId === undefined || data.name !== 'write' && data.name !== 'edit')
                continue;
            const args = parseRecordArgs(data.arguments);
            const filePath = typeof args.file_path === 'string' ? args.file_path : typeof args.filePath === 'string' ? args.filePath : undefined;
            if (filePath === undefined)
                continue;
            const eventAbs = path.resolve(cwd, path.relative(cwd, filePath));
            if (eventAbs !== abs)
                continue;
            ids.add(data.callId);
        }
        return [...ids];
    }
    /**
     * Re-diff a previously accepted file against the accepted content, so a
     * second round of changes shows only what happened after acceptance instead
     * of the whole session diff against the earliest snapshot. Falls back to
     * the original hunks (git / ledger baseline) when the current file is
     * missing, binary, oversized, or unreadable.
     */
    async rebaseHunksOnAccepted(change, acceptedContent) {
        const abs = change.absolutePath;
        const maxBytes = this.acceptContentMaxBytes;
        let current;
        let missing = false;
        try {
            const stat = await fs.promises.stat(abs);
            if (!stat.isFile() || stat.size > maxBytes)
                return;
            const data = await fs.promises.readFile(abs);
            if (data.includes(0))
                return;
            current = data.toString('utf8');
        }
        catch (error) {
            if (error.code === 'ENOENT')
                missing = true;
            else
                return;
        }
        const hunks = missing
            ? lineDiffHunks(normalizeLf(acceptedContent), '')
            : lineDiffHunks(normalizeLf(acceptedContent), normalizeLf(current ?? ''));
        if (hunks.length === 0)
            return;
        const maxHunks = this.options.maxDiffHunksPerFile;
        if (hunks.length > maxHunks) {
            change.hunks = hunks.slice(0, maxHunks);
            change.truncated = true;
        }
        else {
            change.hunks = hunks;
            delete change.truncated;
        }
        delete change.binary;
        delete change.createdAfterSnapshot;
        change.status = missing ? 'deleted' : 'modified';
    }
    async mutationFailure(error, sessionId, bound, guardId, journalId, affected, policy) {
        const message = error instanceof Error ? error.message : String(error);
        const code = message.includes('workspace lock timeout') ? 'lock-timeout'
            : message.includes('running agent') ? 'agent-running'
                : message.includes('git operation') ? 'git-operation-in-progress'
                    : 'rollback-failed';
        let guardRolledBack = guardId === '';
        if (guardId !== '' && affected.length > 0) {
            try {
                const provider = this.snapshots.providerFor(bound.cwd);
                await this.safety.rollbackGuard(this.ctx, provider, this.ledger, guardId, affected, policy);
                guardRolledBack = true;
            }
            catch {
                // Interrupted guard rollback is surfaced through the journal.
            }
        }
        if (journalId !== undefined) {
            await this.safety.journalUpdate(journalId, guardRolledBack ? 'rolled-back' : 'interrupted').catch(() => undefined);
        }
        return fail(code, message, { sessionId, paths: affected });
    }
}
/**
 * The session's real starting turn: the first `turn/start` this session
 * produced itself. Plain new sessions start at turn 1; forked/resumed
 * sessions inherit seed events (which keep their original seq numbers), so
 * their real start is the first turn/start at or after the seed boundary.
 */
export function sessionStartTurn(session) {
    const seedLength = session.header.seedLength ?? 0;
    for (const event of session.events) {
        if (event.type === 'turn/start' && event.seq >= seedLength)
            return event.data.turn;
    }
    return 1;
}
function baselineInfo(manifest, startTurn) {
    return {
        turn: manifest.turn,
        createdAt: manifest.createdAt,
        mode: manifest.tree === undefined ? 'ledger' : 'git',
        ...(manifest.turn > startTurn ? { degraded: true } : {}),
    };
}
/** Content fingerprint of a file; falls back to stat identity for unreadable files. */
export async function fingerprintOfAbs(abs) {
    try {
        const data = await fs.promises.readFile(abs);
        return { kind: 'content', hash: crypto.createHash('sha256').update(data).digest('hex') };
    }
    catch {
        try {
            const stat = await fs.promises.stat(abs);
            return { kind: 'stat', size: stat.size, mtimeMs: stat.mtimeMs };
        }
        catch {
            return undefined;
        }
    }
}
/**
 * Accept-marker data for a file: the content fingerprint (whole file, so
 * later state changes are detected) plus the bounded text content kept as
 * the diff baseline once the file changes again. Binary or oversized files
 * keep only the fingerprint.
 */
export async function acceptSnapshotOf(abs, maxBytes) {
    try {
        const stat = await fs.promises.stat(abs);
        if (!stat.isFile())
            return { fingerprint: { kind: 'stat', size: stat.size, mtimeMs: stat.mtimeMs } };
        const data = await fs.promises.readFile(abs);
        const fingerprint = { kind: 'content', hash: crypto.createHash('sha256').update(data).digest('hex') };
        if (data.length <= maxBytes && !data.includes(0)) {
            return { fingerprint, content: data.toString('utf8') };
        }
        return { fingerprint };
    }
    catch {
        try {
            const stat = await fs.promises.stat(abs);
            return { fingerprint: { kind: 'stat', size: stat.size, mtimeMs: stat.mtimeMs } };
        }
        catch {
            return { fingerprint: undefined };
        }
    }
}
