import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ok, fail } from "./errors.js";
import { sandboxPolicyFor } from "./fs-policy.js";
import { createdFileHunks } from "./ledger.js";
import { buildModificationsFromRecords, parseRecordArgs } from "./restore.js";
import { restoreModification } from "./modification.js";
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
                for (const entry of entries) {
                    if (entry.oldMode === '160000' || entry.newMode === '160000') {
                        warnings.push(entry.oldMode !== '160000'
                            ? `nested git repository "${entry.path}" appeared after the baseline snapshot; it is outside the list scope and will not be deleted or restored`
                            : `nested git repository "${entry.path}" is tracked as a gitlink; its internal changes are outside the list scope (only tool-written files inside it can be restored)`);
                        continue;
                    }
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
                    const diff = await provider.diffHunks(earliest.tree, preparedTree, entry.path);
                    changes.push({
                        path: entry.path,
                        absolutePath: provider.absolutePath(entry.path),
                        status: entry.status === 'D' ? 'deleted' : entry.status === 'T' ? 'typechange' : diff.binary ? 'binary' : 'modified',
                        source: 'git',
                        restorable: true,
                        ...(diff.binary ? { binary: true } : {}),
                        ...(diff.truncated ? { truncated: true } : {}),
                        ...(diff.hunks.length > 0 ? { hunks: diff.hunks } : {}),
                    });
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
        for (const change of changes) {
            change.accepted = this.accepts.fileAccepted(sessionId, change.path, await fingerprintOfAbs(change.absolutePath));
        }
        for (const modification of modifications) {
            modification.accepted = this.accepts.modificationAccepted(sessionId, modification.modificationId);
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
            ...(earliest === undefined ? {} : { baseline: baselineInfo(earliest) }),
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
        this.accepts.acceptFile(request.sessionId, rel, await fingerprintOfAbs(provider.absolutePath(rel)));
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
                this.accepts.acceptFile(request.sessionId, rel, await fingerprintOfAbs(provider.absolutePath(rel)));
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
                this.accepts.acceptFile(request.sessionId, rel, await fingerprintOfAbs(provider.absolutePath(rel)));
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
            this.accepts.acceptFile(request.sessionId, change.path, await fingerprintOfAbs(change.absolutePath));
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
                    this.accepts.acceptFile(request.sessionId, rel, await fingerprintOfAbs(provider.absolutePath(rel)));
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
function baselineInfo(manifest) {
    return {
        turn: manifest.turn,
        createdAt: manifest.createdAt,
        mode: manifest.tree === undefined ? 'ledger' : 'git',
        ...(manifest.turn > 1 ? { degraded: true } : {}),
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
