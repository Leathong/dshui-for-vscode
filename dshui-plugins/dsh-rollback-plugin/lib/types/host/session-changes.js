import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { ok } from "./errors.js";
import { applyHunkUndo, patchFileViews, replayPatches } from "./hunk-undo.js";
export class SessionChangeManager {
    ctx;
    snapshots;
    tracker;
    accepts;
    safety;
    options;
    bound = new Map();
    constructor(ctx, snapshots, tracker, accepts, safety, options) {
        this.ctx = ctx;
        this.snapshots = snapshots;
        this.tracker = tracker;
        this.accepts = accepts;
        this.safety = safety;
        this.options = options;
    }
    async sessionChanges(sessionId) {
        const live = this.liveSession(sessionId);
        if (!live.ok)
            return live;
        const session = live.value;
        const cwd = session.header.cwd ?? '';
        if (cwd === '')
            return failure('session-not-live', `session "${sessionId}" has no workspace cwd`, { sessionId });
        const warnings = [];
        const provider = this.snapshots.providerFor(cwd, sessionId);
        if (!(await provider.available().catch(() => false))) {
            return failure('rollback-failed', 'the isolated git snapshot repository is unavailable for this workspace', { sessionId });
        }
        // Freeze pending calls first so the patch list matches the worktree, then
        // diff the whole worktree against the accepted baseline in one process.
        await this.tracker.flush(sessionId);
        const sessionBase = await this.seedTree(sessionId, cwd);
        if (sessionBase === undefined) {
            warnings.push('this session has no chain base, so already-accepted files cannot be listed');
        }
        // `requireSeed` keeps the list path from inventing a baseline out of the
        // current worktree — that would silently absorb every other session's
        // content as "accepted here" and hide this session's pending writes.
        const accepted = await this.accepts.ensure(cwd, sessionId, sessionBase, { requireSeed: true });
        if (accepted === undefined) {
            if (sessionBase === undefined) {
                // Nothing has been attributed to this session yet and no accept
                // baseline exists: report an empty list rather than fabricating one.
                return ok(this.emptyValue(session, warnings));
            }
            return failure('rollback-failed', 'no accepted baseline could be established for this session', { sessionId });
        }
        // Stage the paths this session wrote so created (and ignored) files show up
        // in the worktree diff at all, and so the diff stays session-scoped. Nested
        // paths go through their blob instead: `git add -f` records nothing inside
        // an embedded repository without a HEAD (which is also excluded from every
        // capture tree), so a file created there would stay invisible.
        const trackedPaths = [...new Set((await this.tracker.loadCalls(cwd, sessionId)).map(call => call.path))];
        const nestedRoots = await this.nestedRoots(provider);
        const isNestedPath = (rel) => nestedRoots.some(root => rel === root || rel.startsWith(`${root}/`));
        const nestedPaths = trackedPaths.filter(isNestedPath);
        const plainPaths = trackedPaths.filter(rel => !isNestedPath(rel));
        const patch = await provider.withScratch(async (scratch) => {
            await provider.readTree(scratch, accepted);
            await provider.stagePaths(scratch, plainPaths);
            await provider.stagePathsByContent(scratch, nestedPaths);
            return provider.diffPatch(accepted, undefined, [], {
                context: this.options.diffContextLines,
                indexFile: scratch,
            });
        });
        const allViews = patchFileViews(patch, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile);
        // Session scoping: only paths this session actually wrote belong to the
        // list. This replaces the old cross-session activity-window attribution.
        const sessionPaths = new Set(trackedPaths);
        const views = allViews.filter(view => sessionPaths.has(view.path));
        const probe = new Map();
        const changes = views.map(view => {
            probe.set(view.path, view.newBlob);
            const nested = isNestedPath(view.path);
            const created = view.status === 'added';
            return {
                path: view.path,
                absolutePath: provider.absolutePath(view.path),
                status: created ? 'created'
                    : view.status === 'deleted' ? 'deleted'
                        : view.binary ? 'binary'
                            : 'modified',
                source: 'git',
                // Nested files are ordinary blobs in the materialized snapshot tree, so
                // they restore like any other path; the nested repository's own
                // `.git`/index/HEAD are never touched.
                restorable: !view.binary,
                accepted: false,
                ...(created ? { createdAfterSnapshot: true } : {}),
                ...(view.binary ? { binary: true } : {}),
                ...(view.truncated ? { truncated: true } : {}),
                ...(nested ? { nested: true } : {}),
                ...(view.view.length > 0 ? { hunks: view.view } : {}),
            };
        });
        // Per-call patches, plus the post-image blob of the newest call per path so
        // "this session changed the file after accepting it" can be told apart from
        // a write by another session (or by hand).
        const { items: modifications, latestBlob, attributable } = await this.modifications(session, cwd, provider, accepted, views);
        // The current content is provably *not* ours only when the newest tracked
        // call has a usable post-image that differs from the worktree. Calls with
        // no post-image at all (oversized, superseded, unavailable) stay on this
        // session's side, matching the previous accept-marker semantics.
        const ownPending = new Set();
        for (const change of changes) {
            const foreign = attributable.get(change.path) === true
                && latestBlob.get(change.path) !== probe.get(change.path);
            if (!foreign)
                ownPending.add(change.path);
        }
        // Rows for what this session already accepted: the accepted tree differs
        // from the session baseline exactly on the paths accept touched. A path the
        // session itself re-changed after accepting is suppressed (it is back in the
        // unaccepted list); a path changed outside the tool chain keeps its accepted
        // row and is flagged instead.
        const acceptedRows = await this.acceptedRows(cwd, provider, sessionBase, accepted, changes, ownPending, warnings);
        const acceptedPaths = new Set(acceptedRows.map(row => row.path));
        for (const change of changes) {
            if (acceptedPaths.has(change.path) && !ownPending.has(change.path))
                change.foreign = true;
        }
        attachToolCalls(changes, modifications);
        for (const rel of this.tracker.oversizedPaths(sessionId)) {
            if (!probe.has(rel))
                warnings.push(`"${rel}" exceeds maxBlobBytes and is only rollback-able at turn granularity`);
        }
        if (this.tracker.baseDegraded(sessionId)) {
            warnings.push('the call chain baseline was captured after the session started; the first write to each path has no caller-level patch');
        }
        const listId = crypto.randomUUID();
        // The bound list is the undo scope: only unaccepted rows (the accepted group
        // is informational and its paths now equal the accepted baseline).
        this.bound.set(listId, {
            listId,
            sessionId,
            cwd,
            accepted,
            ...(sessionBase === undefined ? {} : { sessionBase }),
            probe,
            changes,
            createdAt: Date.now(),
        });
        while (this.bound.size > 32) {
            const oldest = this.bound.keys().next().value;
            if (oldest === undefined)
                break;
            this.bound.delete(oldest);
        }
        const allChanges = [...changes, ...acceptedRows];
        const value = {
            listId,
            baseline: { turn: sessionStartTurn(session), createdAt: Date.now(), mode: 'git' },
            changes: allChanges,
            modifications,
            acceptedFiles: acceptedRows.map(row => row.path),
            acceptedModifications: modifications.filter(item => item.accepted === true).map(item => item.modificationId),
            warnings: [...new Set(warnings)],
        };
        return ok(value);
    }
    async acceptFile(request) {
        const bound = this.requireBound(request.listId, request.sessionId);
        if (!bound.ok)
            return bound;
        const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
        const rel = safeRel(provider, request.path);
        if (rel === undefined)
            return failure('path-not-in-snapshot', `path "${request.path}" is not a valid workspace path`, { sessionId: request.sessionId });
        const accepted = await this.accepts.acceptPaths(bound.value.cwd, bound.value.sessionId, [rel], {
            message: 'accept file',
            ...(bound.value.sessionBase === undefined ? {} : { seedTree: bound.value.sessionBase }),
        });
        if (!accepted.ok)
            return failure('rollback-failed', `accepting "${rel}" failed`, { sessionId: request.sessionId, detail: accepted.reason });
        return ok(await this.acceptValue(bound.value, [rel], accepted.blobs));
    }
    async acceptModification(request) {
        const bound = this.requireBound(request.listId, request.sessionId);
        if (!bound.ok)
            return bound;
        const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
        const located = await this.locatePatch(bound.value, provider, request.modificationId);
        if (located === undefined) {
            return failure('rollback-failed', `patch "${request.modificationId}" is no longer known`, { sessionId: request.sessionId });
        }
        const accepted = await this.accepts.acceptPatch(bound.value.cwd, bound.value.sessionId, located.call.path, located.patch, {
            ...(bound.value.sessionBase === undefined ? {} : { seedTree: bound.value.sessionBase }),
            ...(located.view?.oldBlob === undefined ? {} : { beforeBlob: located.view.oldBlob }),
            ...(located.view?.newBlob === undefined ? {} : { afterBlob: located.view.newBlob }),
        });
        if (!accepted.ok) {
            return failure('patch-conflict', `accepting patch "${request.modificationId}" failed`, {
                sessionId: request.sessionId,
                detail: accepted.reason,
                paths: [located.call.path],
            });
        }
        return ok(await this.acceptValue(bound.value, [located.call.path], accepted.blobs));
    }
    async acceptAll(request) {
        const bound = this.requireBound(request.listId, request.sessionId);
        if (!bound.ok)
            return bound;
        const paths = bound.value.changes.map(change => change.path);
        const accepted = await this.accepts.acceptPaths(bound.value.cwd, bound.value.sessionId, paths, {
            message: 'accept all',
            ...(bound.value.sessionBase === undefined ? {} : { seedTree: bound.value.sessionBase }),
        });
        if (!accepted.ok)
            return failure('rollback-failed', 'accepting the modification list failed', { sessionId: request.sessionId, detail: accepted.reason });
        // `acceptPaths` already knows every accepted blob, so nothing here has to
        // resolve the accepted tree again (this used to be 2 git spawns per file).
        return ok({
            acceptedFiles: paths,
            acceptedModifications: await this.acceptedPatchIds(bound.value, paths, accepted.blobs),
        });
    }
    async undoFile(request) {
        const bound = this.requireBound(request.listId, request.sessionId);
        if (!bound.ok)
            return bound;
        const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
        const rel = safeRel(provider, request.path);
        if (rel === undefined)
            return failure('path-not-in-snapshot', `path "${request.path}" is not a valid workspace path`, { sessionId: request.sessionId });
        const outcome = await this.withUndo(bound.value, [rel], async () => {
            const acceptedBlob = await this.accepts.acceptedBlob(bound.value.cwd, bound.value.sessionId, rel);
            if (acceptedBlob === undefined) {
                await fs.promises.rm(provider.absolutePath(rel), { force: true });
                return { deleted: [rel], acceptedPaths: [rel] };
            }
            await provider.restorePaths(bound.value.accepted, [rel]);
            return { restored: [rel], acceptedPaths: [rel] };
        });
        if (!outcome.ok)
            return outcome;
        const value = {
            guardId: outcome.guardId,
            restored: outcome.run.restored ?? [],
            deleted: outcome.run.deleted ?? [],
            kept: outcome.run.kept ?? [],
            skipped: outcome.run.skipped ?? [],
            acceptedFiles: outcome.run.acceptedPaths,
        };
        return ok(value);
    }
    async undoModification(request) {
        const bound = this.requireBound(request.listId, request.sessionId);
        if (!bound.ok)
            return bound;
        const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
        const located = await this.locatePatch(bound.value, provider, request.modificationId);
        if (located === undefined) {
            return failure('rollback-failed', `patch "${request.modificationId}" is no longer known`, { sessionId: request.sessionId });
        }
        const rel = located.call.path;
        let results = [];
        const outcome = await this.withUndo(bound.value, [rel], async () => {
            const chain = (await this.tracker.loadCalls(bound.value.cwd, bound.value.sessionId))
                .filter(call => call.path === rel && call.commit !== undefined);
            const acceptedBlob = await this.accepts.acceptedBlob(bound.value.cwd, bound.value.sessionId, rel);
            const blobs = await this.callBlobs(provider, chain);
            const steps = [];
            const ids = [];
            for (const call of chain) {
                const blob = blobs.get(call.callId);
                if (blob !== undefined && blob === acceptedBlob)
                    continue;
                steps.push({ path: rel, patch: await this.callPatch(provider, call) });
                ids.push(call.callId);
            }
            const skip = ids.indexOf(request.modificationId);
            if (skip < 0) {
                // Already accepted: nothing to replay, the file is unchanged.
                results = [{ modificationId: request.modificationId, path: rel, status: 'restored' }];
                return { acceptedPaths: [] };
            }
            const replay = await provider.withScratch(scratch => replayPatches(provider, scratch, bound.value.accepted, steps, new Set([skip])));
            if (!replay.ok) {
                results = [{
                        modificationId: request.modificationId,
                        path: rel,
                        status: 'conflict',
                        ...(replay.reason === undefined ? {} : { detail: replay.reason }),
                    }];
                return { acceptedPaths: [] };
            }
            results = [{ modificationId: request.modificationId, path: rel, status: 'restored' }];
            return { restored: [rel], acceptedPaths: [rel] };
        });
        if (!outcome.ok)
            return outcome;
        return ok({
            guardId: outcome.guardId,
            modificationResults: results,
            acceptedModifications: await this.acceptedPatchIds(bound.value, outcome.run.acceptedPaths),
        });
    }
    async undoHunks(request) {
        const bound = this.requireBound(request.listId, request.sessionId);
        if (!bound.ok)
            return bound;
        const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
        const rel = safeRel(provider, request.path);
        if (rel === undefined)
            return failure('path-not-in-snapshot', `path "${request.path}" is not a valid workspace path`, { sessionId: request.sessionId });
        let undone = 0;
        let conflict;
        const outcome = await this.withUndo(bound.value, [rel], async () => {
            const applied = await provider.withScratch(scratch => applyHunkUndo(provider, scratch, {
                acceptedCommit: bound.value.accepted,
                path: rel,
                undo: request.hunks,
                context: this.options.diffContextLines,
            }));
            if (!applied.ok) {
                conflict = applied.reason ?? 'hunk-conflict';
                return { acceptedPaths: [] };
            }
            undone = applied.undone;
            return { restored: [rel], acceptedPaths: [rel] };
        });
        if (!outcome.ok)
            return outcome;
        if (conflict !== undefined) {
            return failure('hunk-conflict', `undoing hunks of "${rel}" failed`, {
                sessionId: request.sessionId,
                detail: conflict,
                paths: [rel],
            });
        }
        return ok({
            guardId: outcome.guardId,
            undone,
            acceptedFiles: outcome.run.acceptedPaths,
            acceptedModifications: await this.acceptedPatchIds(bound.value, outcome.run.acceptedPaths),
        });
    }
    async undoAll(request) {
        const bound = this.requireBound(request.listId, request.sessionId);
        if (!bound.ok)
            return bound;
        const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
        const paths = bound.value.changes.map(change => provider.normalizeRelPath(change.path));
        const outcome = await this.withUndo(bound.value, paths, async () => {
            const restored = [];
            const deleted = [];
            const accepted = await this.acceptedBlobMap(bound.value, provider, paths);
            for (const rel of paths) {
                if (accepted.get(rel) === undefined) {
                    await fs.promises.rm(provider.absolutePath(rel), { force: true });
                    deleted.push(rel);
                }
                else {
                    restored.push(rel);
                }
            }
            if (restored.length > 0)
                await provider.restorePaths(bound.value.accepted, restored);
            return { restored, deleted, acceptedPaths: paths };
        });
        if (!outcome.ok)
            return outcome;
        const value = {
            guardId: outcome.guardId,
            restored: outcome.run.restored ?? [],
            deleted: outcome.run.deleted ?? [],
            kept: outcome.run.kept ?? [],
            skipped: outcome.run.skipped ?? [],
            acceptedFiles: outcome.run.acceptedPaths,
        };
        return ok(value);
    }
    /**
     * Shared undo skeleton: verify the listed worktree state is unchanged, take
     * the workspace lock, fence, flush the session, guard the affected paths, run
     * the mutation, journal it, and auto-accept the result.
     */
    async withUndo(bound, paths, run) {
        const live = this.liveSession(bound.sessionId);
        if (!live.ok)
            return live;
        const provider = this.snapshots.providerFor(bound.cwd, bound.sessionId);
        const unique = [...new Set(paths)];
        // One `hash-object --stdin-paths` for the whole probe set instead of one
        // spawn per path.
        const current = await provider.hashBlobs(unique).catch(() => new Map());
        for (const rel of unique) {
            const expected = bound.probe.get(rel);
            if (current.get(rel) !== expected) {
                return failure('workspace-changed', `"${rel}" changed after the list was read; refresh and try again`, {
                    sessionId: bound.sessionId,
                    paths: [rel],
                });
            }
        }
        await this.safety.acquire(bound.cwd);
        let journalId;
        try {
            await this.safety.assertFences(this.ctx, bound.cwd, provider);
            await this.ctx.sessions.flush(live.value);
            const guard = await this.safety.captureGuard(provider, { cwd: bound.cwd, sessionId: bound.sessionId }, unique);
            journalId = await this.safety.journalStart(provider, guard, unique);
            try {
                const result = await run();
                await this.safety.journalUpdate(provider, journalId, 'completed');
                if (result.acceptedPaths.length > 0) {
                    await this.accepts.acceptPaths(bound.cwd, bound.sessionId, result.acceptedPaths, {
                        message: 'auto accept after undo',
                        ...(bound.sessionBase === undefined ? {} : { seedTree: bound.sessionBase }),
                    });
                }
                return { ok: true, guardId: guard.guardId, run: result };
            }
            catch (error) {
                await this.safety.restoreGuard(provider, guard, unique).catch(() => undefined);
                await this.safety.journalUpdate(provider, journalId, 'rolled-back');
                return failure('rollback-failed', error instanceof Error ? error.message : 'rollback failed', {
                    sessionId: bound.sessionId,
                    paths: unique,
                });
            }
        }
        catch (error) {
            if (journalId !== undefined) {
                await this.safety.journalUpdate(provider, journalId, 'interrupted').catch(() => undefined);
            }
            return failure('rollback-failed', error instanceof Error ? error.message : 'rollback failed', { sessionId: bound.sessionId });
        }
        finally {
            await this.safety.release().catch(() => undefined);
        }
    }
    requireBound(listId, sessionId) {
        const bound = this.bound.get(listId);
        if (bound === undefined || bound.sessionId !== sessionId) {
            return failure('workspace-changed', 'the modification list is stale; refresh it and try again', { sessionId });
        }
        return { ok: true, value: bound };
    }
    liveSession(sessionId) {
        const session = this.ctx.sessions.get(sessionId);
        if (session === undefined)
            return failure('session-not-found', `unknown session "${sessionId}"`, { sessionId });
        const cwd = session.header?.cwd;
        if (cwd === undefined || cwd === '') {
            return failure('session-not-live', `session "${sessionId}" has no workspace cwd`, { sessionId });
        }
        return { ok: true, value: session };
    }
    /**
     * Turn-start tree of this session, used to seed the accepted baseline. Read
     * from the persisted `refs/dsh/base` rather than the in-memory anchor: after
     * a host restart that anchor is gone or has been re-pointed at the chain tip,
     * which would silently drop every already-accepted file from the list.
     */
    async seedTree(sessionId, cwd) {
        const base = await this.tracker.readBase(cwd, sessionId).catch(() => undefined);
        if (base === undefined)
            return undefined;
        return this.snapshots.providerFor(cwd, sessionId).treeOf(base).catch(() => undefined);
    }
    /** A list with nothing to show (no chain, no accept baseline yet). */
    emptyValue(session, warnings) {
        return {
            listId: crypto.randomUUID(),
            baseline: { turn: sessionStartTurn(session), createdAt: Date.now(), mode: 'git' },
            changes: [],
            modifications: [],
            acceptedFiles: [],
            acceptedModifications: [],
            warnings: [...new Set(warnings)],
        };
    }
    /**
     * Accepted rows: paths whose accepted content differs from the session
     * baseline, i.e. what this session accepted. One diff process; hunks are
     * intentionally omitted (the accepted group is a file list).
     *
     * Suppression is per *attribution*, not per path: only paths this session
     * itself re-wrote after accepting (`ownPending`) leave the accepted group.
     * A path touched by another session keeps its accepted row and is reported
     * through `warnings`, instead of silently masquerading as a change of ours.
     */
    async acceptedRows(cwd, provider, sessionBase, accepted, changes, ownPending, warnings) {
        if (sessionBase === undefined)
            return [];
        // Both sides must be trees: `diff-tree` only compares trees, and the
        // accepted ref points at a commit.
        const acceptedTree = await provider.treeOf(accepted).catch(() => undefined);
        if (acceptedTree === undefined) {
            warnings.push('the accepted baseline tree could not be read; already-accepted files are not listed');
            return [];
        }
        if (acceptedTree === sessionBase)
            return [];
        const entries = await provider.diffEntries(sessionBase, acceptedTree).catch(() => undefined);
        if (entries === undefined) {
            warnings.push('the accepted-file list could not be computed from the snapshot repository');
            return [];
        }
        const foreign = changes.filter(change => !ownPending.has(change.path)
            && entries.some(entry => entry.path === change.path))
            .map(change => change.path);
        if (foreign.length > 0) {
            warnings.push(`already-accepted path(s) changed outside this session's tool chain: ${summarize(foreign)}`);
        }
        return entries
            .filter(entry => !ownPending.has(entry.path))
            .map(entry => ({
            path: entry.path,
            absolutePath: provider.absolutePath(entry.path),
            status: entry.status === 'A' ? 'created' : entry.status === 'D' ? 'deleted' : 'modified',
            source: 'git',
            restorable: true,
            accepted: true,
        }));
    }
    async nestedRoots(provider) {
        return this.snapshots.nestedRoots(provider.cwd, provider);
    }
    /**
     * Per-call patches of the session chain, with hunks and accept state. Also
     * reports, per path, the post-image blob of the *newest* call and whether that
     * call has a usable post-image — the caller uses it to attribute the worktree
     * content to this session (or to somebody else).
     */
    async modifications(session, cwd, provider, accepted, views) {
        const calls = await this.tracker.loadCalls(cwd, session.id);
        if (calls.length === 0)
            return { items: [], latestBlob: new Map(), attributable: new Map() };
        const commits = calls.map(call => call.commit).filter((commit) => commit !== undefined);
        const patches = commits.length > 0
            ? await provider.diffTreePatches(commits, { context: this.options.diffContextLines }).catch(() => new Map())
            : new Map();
        // Accepted blobs are needed for every patched path, including files that
        // already left the list (their patches must still report as accepted). One
        // `cat-file --batch-check` for all of them instead of one `rev-parse` each.
        const patched = [...new Set(calls.map(call => call.path))];
        const acceptedHashes = await provider
            .blobHashes(patched.map(path => ({ treeish: accepted, path })))
            .catch(() => new Array(patched.length));
        const acceptedBlobs = new Map();
        patched.forEach((rel, index) => acceptedBlobs.set(rel, acceptedHashes[index]));
        const blobs = await this.callBlobs(provider, calls);
        const byPath = new Map();
        for (const call of calls) {
            const list = byPath.get(call.path) ?? [];
            list.push(call);
            byPath.set(call.path, list);
        }
        // `calls` is in chain order, so the last write per path wins.
        const latestBlob = new Map();
        const attributable = new Map();
        const result = [];
        for (const call of calls) {
            const raw = call.commit === undefined ? '' : patches.get(call.commit) ?? '';
            const view = patchFileViews(raw, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile)
                .find(item => item.path === call.path);
            const blob = blobs.get(call.callId);
            const acceptedBlob = acceptedBlobs.get(call.path);
            const later = (byPath.get(call.path) ?? []).filter(item => item.seq > call.seq).map(item => item.callId);
            latestBlob.set(call.path, blob);
            // A deletion is a known post-image (absent); a call with neither a blob
            // nor a commit produced nothing we can compare against.
            attributable.set(call.path, call.deleted === true || blob !== undefined || call.commit !== undefined);
            result.push({
                modificationId: call.callId,
                toolName: call.toolName === 'write' ? 'write' : 'edit',
                path: call.path,
                turn: call.turn,
                step: call.step,
                seq: call.seq,
                hunks: view?.view ?? [],
                restorable: call.commit === undefined || call.oversized === true
                    ? 'unsupported'
                    : view?.status === 'added' ? 'file-only' : 'merge',
                accepted: acceptedBlob !== undefined && blob !== undefined && blob === acceptedBlob,
                ...(call.superseded === true ? { reason: 'the path was rewritten before this call could be recorded' } : {}),
                ...(call.deleted === true ? { reason: 'this call removed the file' } : {}),
                ...(view?.status === 'added' ? { createdFile: true } : {}),
                ...(later.length > 0 ? { laterModificationIds: later } : {}),
            });
        }
        return {
            items: result.sort((a, b) => a.seq - b.seq || a.turn - b.turn || a.step - b.step),
            latestBlob,
            attributable,
        };
    }
    async locatePatch(bound, provider, modificationId) {
        const call = (await this.tracker.loadCalls(bound.cwd, bound.sessionId)).find(item => item.callId === modificationId);
        if (call === undefined)
            return undefined;
        const patch = await this.callPatch(provider, call);
        const view = patchFileViews(patch, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile)
            .find(item => item.path === call.path);
        return { call, patch, ...(view === undefined ? {} : { view }) };
    }
    /**
     * Post-image blob of every call, keyed by `callId`. Blobs already in memory
     * (the common case) are used as-is; the rest — a cold read after a restart
     * leaves `TrackedCall.blob` unset — are resolved in one
     * `cat-file --batch-check` instead of one `rev-parse` per call.
     */
    async callBlobs(provider, calls) {
        const result = new Map();
        const pending = [];
        for (const call of calls) {
            if (call.blob !== undefined) {
                result.set(call.callId, call.blob);
                continue;
            }
            if (call.deleted === true || call.commit === undefined) {
                result.set(call.callId, undefined);
                continue;
            }
            pending.push(call);
        }
        if (pending.length > 0) {
            const hashes = await provider
                .blobHashes(pending.map(call => ({ treeish: call.commit, path: call.path })))
                .catch(() => new Array(pending.length));
            pending.forEach((call, index) => result.set(call.callId, hashes[index]));
        }
        return result;
    }
    async callPatch(provider, call) {
        if (call.commit === undefined)
            return '';
        const result = await provider.run([
            'diff-tree', '-p', '--no-renames', '--full-index',
            `--unified=${this.options.diffContextLines}`,
            `${call.commit}^`, call.commit, '--', call.path,
        ]);
        return result.code === 0 ? result.stdout : '';
    }
    /**
     * Accepted blob of many paths in one process. `AcceptBase.acceptedBlob`
     * resolves the ref and spawns per path; the accept paths ask for every
     * changed file at once. `known` entries (from the accept that just ran) are
     * reused as-is, and only the paths it did not cover are resolved.
     */
    async acceptedBlobMap(bound, provider, paths, known) {
        const result = new Map();
        const missing = [];
        for (const rel of [...new Set(paths)]) {
            if (known !== undefined && known.has(rel))
                result.set(rel, known.get(rel));
            else
                missing.push(rel);
        }
        if (missing.length > 0) {
            const commit = await this.accepts.ref(bound.cwd, bound.sessionId);
            const hashes = commit === undefined
                ? new Array(missing.length)
                : await provider
                    .blobHashes(missing.map(path => ({ treeish: commit, path })))
                    .catch(() => new Array(missing.length));
            missing.forEach((rel, index) => result.set(rel, hashes[index]));
        }
        return result;
    }
    async acceptValue(bound, paths, acceptedBlobs) {
        const provider = this.snapshots.providerFor(bound.cwd, bound.sessionId);
        const unique = [...new Set(paths)];
        const accepted = await this.acceptedBlobMap(bound, provider, unique, acceptedBlobs);
        const current = await provider.hashBlobs(unique).catch(() => new Map());
        const acceptedFiles = [];
        for (const rel of unique) {
            const acceptedBlob = accepted.get(rel);
            if (acceptedBlob !== undefined && acceptedBlob === current.get(rel))
                acceptedFiles.push(rel);
        }
        return { acceptedFiles, acceptedModifications: await this.acceptedPatchIds(bound, unique, accepted) };
    }
    /**
     * Patch ids whose post-image already equals the accepted content. Pass
     * `acceptedBlobs` (from the accept that just ran) to skip resolving the
     * accepted tree again.
     */
    async acceptedPatchIds(bound, paths, acceptedBlobs) {
        const provider = this.snapshots.providerFor(bound.cwd, bound.sessionId);
        const unique = [...new Set(paths)];
        const wanted = new Set(unique);
        const accepted = await this.acceptedBlobMap(bound, provider, unique, acceptedBlobs);
        const calls = (await this.tracker.loadCalls(bound.cwd, bound.sessionId)).filter(call => wanted.has(call.path));
        const blobs = await this.callBlobs(provider, calls);
        const byPath = new Map();
        for (const call of calls) {
            const list = byPath.get(call.path) ?? [];
            list.push(call);
            byPath.set(call.path, list);
        }
        const ids = [];
        // Path-major order, matching the previous per-path implementation.
        for (const rel of unique) {
            const acceptedBlob = accepted.get(rel);
            if (acceptedBlob === undefined)
                continue;
            for (const call of byPath.get(rel) ?? []) {
                if (blobs.get(call.callId) === acceptedBlob)
                    ids.push(call.callId);
            }
        }
        return ids;
    }
}
/** Failure-only result, so control flow narrows without the `ok: true` branch. */
function failure(code, message, fields = {}) {
    return { ok: false, error: { code, message, ...fields } };
}
function safeRel(provider, input) {
    try {
        return provider.normalizeRelPath(input);
    }
    catch {
        return undefined;
    }
}
/** Short, bounded path list for a warning message. */
export function summarize(paths, max = 3) {
    const shown = paths.slice(0, max).join(', ');
    return paths.length > max ? `${shown}, … (+${paths.length - max})` : shown;
}
/** Attach per-path tool-call patch lists to the file rows. */
export function attachToolCalls(changes, modifications) {
    for (const change of changes) {
        const calls = modifications.filter(item => item.path === change.path);
        if (calls.length === 0)
            continue;
        const toolCalls = calls.map(item => ({
            callId: item.modificationId,
            toolName: item.toolName,
            turn: item.turn,
            step: item.step,
            seq: item.seq,
            hunks: item.hunks,
        }));
        change.toolCalls = toolCalls;
    }
}
/** The turn the session started at (first `turn/start`). */
export function sessionStartTurn(session) {
    const event = session.snapshotEvents().find(item => item.type === 'turn/start');
    const data = event?.data;
    return data?.turn ?? 0;
}
