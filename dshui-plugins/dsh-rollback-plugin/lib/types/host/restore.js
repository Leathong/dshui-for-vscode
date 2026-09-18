import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ok, fail } from "./errors.js";
import { resolveBoundary, resolveBoundaryForTurn, boundaryInfo } from "./boundary.js";
import { patchFileViews, replayPatches } from "./hunk-undo.js";
import { attachToolCalls } from "./session-changes.js";
export class RollbackRestore {
    ctx;
    snapshots;
    tracker;
    safety;
    options;
    prepared = new Map();
    constructor(ctx, snapshots, tracker, safety, options) {
        this.ctx = ctx;
        this.snapshots = snapshots;
        this.tracker = tracker;
        this.safety = safety;
        this.options = options;
    }
    async prepare(sessionId, messageId) {
        const base = this.prepareBase(sessionId);
        if (!base.ok)
            return base;
        const resolved = resolveBoundary(base.value.session, messageId);
        if (resolved.failure !== undefined)
            return fail(resolved.failure.code, resolved.failure.message, resolved.failure);
        return this.prepareWithBoundary(base.value, resolved.boundary, messageId);
    }
    /** Turn-anchored prepare: also serves unfinished (stopped) turns. */
    async prepareTurn(sessionId, turn) {
        const base = this.prepareBase(sessionId);
        if (!base.ok)
            return base;
        if (!Number.isInteger(turn) || turn < 1) {
            return fail('turn-not-found', `turn ${String(turn)} is not a valid turn number`, { sessionId });
        }
        const resolved = resolveBoundaryForTurn(base.value.session, turn);
        if (resolved.failure !== undefined)
            return fail(resolved.failure.code, resolved.failure.message, resolved.failure);
        return this.prepareWithBoundary(base.value, resolved.boundary);
    }
    prepareBase(sessionId) {
        const live = this.liveSession(sessionId);
        if (!live.ok)
            return live;
        const session = live.value;
        const cwd = session.header.cwd;
        if (cwd === undefined) {
            return fail('session-not-live', `session "${sessionId}" has no workspace cwd`);
        }
        return ok({ session, cwd });
    }
    async prepareWithBoundary(base, boundary, messageId) {
        const { session, cwd } = base;
        const sessionId = session.id;
        const found = await this.snapshots.find(cwd, sessionId, boundary.targetTurn);
        if (found === undefined) {
            return fail('snapshot-unavailable', `no rollback snapshot is available for turn ${boundary.targetTurn}`, { sessionId, messageId });
        }
        const provider = this.snapshots.providerFor(cwd, base.session.id);
        const gitAvailable = await provider.available();
        if (found.manifest.tree !== undefined && !(await this.snapshots.ensureTreeAvailable(found.manifest, provider))) {
            return fail('snapshot-expired', 'the snapshot objects are no longer available (the session store was removed or garbage collected)', { sessionId, messageId });
        }
        const warnings = [...(found.degraded ? [`snapshot is from turn ${found.manifest.turn}, before the requested turn ${boundary.targetTurn}`] : [])];
        let preparedTree;
        let changes = [];
        if (found.manifest.tree !== undefined && gitAvailable) {
            preparedTree = await provider.captureTree();
            const entries = await provider.diffEntries(found.manifest.tree, preparedTree);
            for (const entry of entries) {
                if (entry.oldMode === '160000' || entry.newMode === '160000') {
                    warnings.push(entry.oldMode !== '160000'
                        ? `nested git repository "${entry.path}" appeared after the snapshot; it is outside the rollback scope and will not be deleted or restored`
                        : `nested git repository "${entry.path}" is tracked as a gitlink; its internal changes are outside the rollback scope (only tool-written files inside it can be restored)`);
                    continue;
                }
                if (entry.status === 'A') {
                    changes.push({
                        path: entry.path,
                        absolutePath: provider.absolutePath(entry.path),
                        status: 'created',
                        source: 'git',
                        restorable: false,
                        createdAfterSnapshot: true,
                    });
                    continue;
                }
                const diff = await provider.diffHunks(found.manifest.tree, preparedTree, entry.path);
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
        else if (found.manifest.tree !== undefined) {
            warnings.push('the isolated snapshot store is unavailable; only the tracked call chain is available');
        }
        const modifications = await this.buildModifications(session, cwd, found.manifest.turn, provider);
        attachToolCalls(changes, modifications);
        const prepareId = crypto.randomUUID();
        const prepared = {
            prepareId,
            sessionId,
            ...(messageId === undefined ? {} : { messageId }),
            turn: boundary.targetTurn,
            cwd,
            snapshot: found.manifest,
            degraded: found.degraded,
            boundary,
            ...(preparedTree === undefined ? {} : { preparedTree }),
            gitAvailable,
            changes,
            modifications,
            warnings: [...new Set(warnings)],
            createdAt: Date.now(),
        };
        this.prepared.set(prepareId, prepared);
        return ok({
            prepareId,
            snapshot: this.snapshots.snapshotInfo(found.manifest, found.degraded),
            boundary: boundaryInfo(boundary),
            changes,
            modifications,
            warnings: prepared.warnings,
        });
    }
    async execute(request) {
        if (request.confirmed !== true)
            return fail('rollback-failed', 'rollback execution requires confirmed: true');
        const prepared = this.prepared.get(request.prepareId);
        if (prepared === undefined || prepared.sessionId !== request.sessionId) {
            return fail('workspace-changed', 'prepare context is missing or does not match this session; run prepare again', {
                sessionId: request.sessionId,
                ...(request.messageId === undefined ? {} : { messageId: request.messageId }),
            });
        }
        if (request.messageId !== undefined && prepared.messageId !== request.messageId) {
            return fail('workspace-changed', 'prepare context does not match this message; run prepare again', {
                sessionId: request.sessionId,
                messageId: request.messageId,
            });
        }
        if (request.messageId === undefined && (request.turn === undefined || prepared.turn !== request.turn)) {
            return fail('workspace-changed', 'prepare context does not match this turn; run prepare again', {
                sessionId: request.sessionId,
            });
        }
        if (request.scope === 'modifications' && request.paths !== undefined && request.paths.length > 0) {
            return fail('rollback-failed', 'scope=modifications is mutually exclusive with paths');
        }
        if (request.scope === 'files' && request.modificationIds !== undefined && request.modificationIds.length > 0) {
            return fail('rollback-failed', 'scope=files is mutually exclusive with modificationIds');
        }
        const live = this.liveSession(request.sessionId);
        if (!live.ok)
            return live;
        const session = live.value;
        const provider = this.snapshots.providerFor(prepared.cwd, prepared.sessionId);
        let guardId = '';
        let journalId;
        let guardTree;
        let acquired = false;
        const affected = new Set();
        try {
            // Re-capture G2 and compare with the tree bound into prepareId.
            if (prepared.preparedTree !== undefined) {
                guardTree = await provider.captureTree();
                if (guardTree !== prepared.preparedTree) {
                    return fail('workspace-changed', 'the workspace changed after prepare; please preview again', {
                        sessionId: request.sessionId,
                        messageId: request.messageId,
                    });
                }
            }
            await this.safety.acquire(prepared.cwd);
            acquired = true;
            await this.safety.assertFences(this.ctx, prepared.cwd, provider);
            await this.ctx.sessions.flush(session);
            if (request.scope === 'modifications') {
                return await this.executeModifications(prepared, request, provider, affected);
            }
            const selected = await this.selectFilePaths(prepared, request, provider);
            if (!selected.ok)
                return selected;
            for (const item of selected.value.all)
                affected.add(item);
            const guard = await this.safety.captureGuard(provider, { cwd: prepared.cwd, sessionId: prepared.sessionId }, selected.value.all);
            guardId = guard.guardId;
            journalId = await this.safety.journalStart(provider, guard, selected.value.all);
            const restored = [];
            const kept = [];
            const deleted = [];
            const skipped = [];
            try {
                const gitRestore = selected.value.git.filter(item => item.inSnapshot);
                const gitCreated = selected.value.git.filter(item => !item.inSnapshot);
                const restoreRels = gitRestore.map(item => item.rel);
                const snapshotTree = prepared.snapshot.tree ?? '';
                await provider.restorePaths(snapshotTree, restoreRels);
                // Batched verification: one `cat-file --batch-check` for the expected
                // blobs and one `hash-object --stdin-paths` for the worktree, instead
                // of two spawns per restored path.
                const expected = await provider
                    .blobHashes(restoreRels.map(path => ({ treeish: snapshotTree, path })))
                    .catch(() => new Array(restoreRels.length));
                const actual = await provider.hashBlobs(restoreRels).catch(() => new Map());
                for (let index = 0; index < restoreRels.length; index += 1) {
                    const rel = restoreRels[index];
                    if (expected[index] !== actual.get(rel))
                        throw new Error(`verification failed for ${rel}`);
                    restored.push(rel);
                }
                for (const item of gitCreated) {
                    const abs = provider.absolutePath(item.rel);
                    if (!fs.existsSync(abs)) {
                        skipped.push(item.rel);
                        continue;
                    }
                    if (request.createdPolicy === 'delete') {
                        fs.rmSync(abs, { force: true });
                        deleted.push(item.rel);
                    }
                    else {
                        kept.push(item.rel);
                    }
                }
                await this.safety.journalUpdate(provider, journalId, 'completed');
                return ok({
                    guardId,
                    restored,
                    kept,
                    deleted,
                    skipped,
                    ...(request.scope === 'turn'
                        ? prepared.boundary.forkAtSeq !== undefined
                            ? { forkAnchor: prepared.boundary.forkAtSeq }
                            : { restart: true, cwd: prepared.cwd }
                        : {}),
                });
            }
            catch (error) {
                await this.safety.restoreGuard(provider, guard, selected.value.all).catch(() => undefined);
                await this.safety.journalUpdate(provider, journalId, 'rolled-back').catch(() => undefined);
                const code = error instanceof Error && error.message.startsWith('verification failed') ? 'verification-failed' : 'rollback-failed';
                return fail(code, String(error), { sessionId: request.sessionId, messageId: request.messageId, paths: selected.value.all });
            }
        }
        catch (error) {
            return this.executeFailure(error, request, prepared, guardId, journalId, affected);
        }
        finally {
            if (acquired)
                await this.safety.release();
        }
    }
    async status(sessionId) {
        const live = this.liveSession(sessionId);
        if (!live.ok)
            return live;
        const session = live.value;
        const cwd = session.header.cwd ?? process.cwd();
        const lock = await this.safety.readLock(cwd);
        return ok({
            journal: await this.safety.listJournals(this.snapshots.providerFor(cwd, sessionId)),
            ...(lock === undefined ? {} : { lock }),
        });
    }
    async openAt(sessionId, request) {
        const live = this.liveSession(sessionId);
        if (!live.ok)
            return live;
        const cwd = live.value.header.cwd;
        if (cwd === undefined)
            return fail('session-not-live', `session "${sessionId}" has no workspace cwd`);
        const provider = this.snapshots.providerFor(cwd, live.value.id);
        let rel;
        try {
            rel = provider.normalizeRelPath(request.path);
        }
        catch {
            return ok({ opened: false, reason: 'invalid-path' });
        }
        const abs = provider.absolutePath(rel);
        if (request.line !== undefined && (!Number.isInteger(request.line) || request.line < 1)) {
            return ok({ opened: false, reason: 'invalid-path' });
        }
        if (request.endLine !== undefined && (!Number.isInteger(request.endLine) || request.endLine < 1)) {
            return ok({ opened: false, reason: 'invalid-path' });
        }
        const bridge = await pickBridgeEndpoint(abs);
        if (bridge === null)
            return ok({ opened: false, reason: 'bridge-unavailable' });
        try {
            const url = new URL(bridge.endpoint);
            url.searchParams.set('path', abs);
            if (request.line !== undefined)
                url.searchParams.set('line', String(request.line));
            if (request.endLine !== undefined)
                url.searchParams.set('endLine', String(request.endLine));
            if (bridge.token !== undefined && bridge.token !== '')
                url.searchParams.set('token', bridge.token);
            const response = await fetch(url, { signal: AbortSignal.timeout(this.options.spawnTimeoutMs) });
            if (!response.ok)
                return ok({ opened: false, reason: 'bridge-unavailable' });
            return ok({ opened: true });
        }
        catch {
            return ok({ opened: false, reason: 'bridge-unavailable' });
        }
    }
    liveSession(sessionId) {
        const session = this.ctx.sessions.get(sessionId);
        if (session === undefined)
            return fail('session-not-found', `session "${sessionId}" is not live`, { sessionId });
        return ok(session);
    }
    async selectFilePaths(prepared, request, provider) {
        // scope=files distinguishes an absent paths field (undefined → every
        // restorable change, the documented legacy meaning) from an explicit
        // selection: a present but empty array means the user unchecked every
        // file, which must restore nothing instead of falling back to "all".
        const requested = request.scope === 'files' ? request.paths : undefined;
        const normalizedRequested = requested?.map(item => {
            try {
                return provider.normalizeRelPath(item);
            }
            catch {
                return undefined;
            }
        });
        if (normalizedRequested?.some(item => item === undefined)) {
            return fail('path-not-in-snapshot', 'one or more selected paths are invalid workspace paths', {
                sessionId: request.sessionId,
                messageId: request.messageId,
                paths: request.paths,
            });
        }
        const normalized = normalizedRequested ?? [];
        const changes = requested === undefined
            ? prepared.changes.filter(change => change.restorable || request.createdPolicy === 'delete')
            : normalized.flatMap(rel => {
                if (rel === undefined)
                    return [];
                const change = prepared.changes.find(item => item.path === rel);
                if (change === undefined)
                    return [];
                return [change];
            });
        if (requested !== undefined && normalizedRequested !== undefined) {
            const missing = normalized.filter((rel, index) => rel !== undefined && prepared.changes.every(item => item.path !== rel));
            const rawMissing = missing.map(rel => requested[normalized.indexOf(rel)] ?? rel);
            if (missing.length > 0) {
                return fail('path-not-in-snapshot', 'selected paths are not part of the prepared changes', {
                    sessionId: request.sessionId,
                    messageId: request.messageId,
                    paths: rawMissing,
                });
            }
        }
        const all = [];
        const git = [];
        for (const change of changes) {
            const rel = change.path;
            all.push(rel);
            let inSnapshot = false;
            if (prepared.snapshot.tree !== undefined) {
                const paths = await provider.pathsInTree(prepared.snapshot.tree, rel);
                inSnapshot = paths.includes(rel);
            }
            git.push({ rel, inSnapshot });
        }
        return ok({ all, git });
    }
    /** Per-call patches of one turn, read from the tracked commit chain. */
    async buildModifications(session, cwd, turn, provider) {
        const calls = (await this.tracker.loadCalls(cwd, session.id)).filter(call => call.turn === turn);
        if (calls.length === 0)
            return [];
        const commits = calls.map(call => call.commit).filter((commit) => commit !== undefined);
        const patches = commits.length > 0
            ? await provider.diffTreePatches(commits, { context: 3 }).catch(() => new Map())
            : new Map();
        const result = [];
        for (const call of calls) {
            const raw = call.commit === undefined ? '' : patches.get(call.commit) ?? '';
            const view = patchFileViews(raw, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile)
                .find(item => item.path === call.path);
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
                ...(view?.status === 'added' ? { createdFile: true } : {}),
            });
        }
        return result.sort((a, b) => a.seq - b.seq || a.turn - b.turn || a.step - b.step);
    }
    /**
     * `scope='modifications'`: rebuild each affected file as "turn-start state +
     * every call of the turn except the selected ones", applied forward in call
     * order (docs/git-only-plan.md §2.7).
     */
    async executeModifications(prepared, request, provider, affected) {
        const ids = request.modificationIds ?? [];
        if (ids.length === 0)
            return fail('rollback-failed', 'scope=modifications requires modificationIds');
        const calls = await this.tracker.loadCalls(prepared.cwd, request.sessionId);
        const selected = new Set(ids);
        if (!calls.some(call => selected.has(call.callId))) {
            return fail('rollback-failed', 'none of the requested modifications are available', {
                sessionId: request.sessionId,
                messageId: request.messageId,
            });
        }
        const byPath = new Map();
        for (const call of calls) {
            if (call.turn !== prepared.snapshot.turn || call.commit === undefined)
                continue;
            const list = byPath.get(call.path) ?? [];
            list.push(call);
            byPath.set(call.path, list);
        }
        const paths = [...byPath.entries()]
            .filter(([, chain]) => chain.some(call => selected.has(call.callId)))
            .map(([rel]) => rel);
        if (paths.length === 0) {
            return fail('rollback-failed', 'none of the requested modifications belong to this turn', {
                sessionId: request.sessionId,
                messageId: request.messageId,
            });
        }
        for (const rel of paths)
            affected.add(rel);
        const guard = await this.safety.captureGuard(provider, { cwd: prepared.cwd, sessionId: prepared.sessionId }, paths);
        const journalId = await this.safety.journalStart(provider, guard, paths);
        const results = [];
        const restoredPaths = [];
        const failedPaths = [];
        try {
            await provider.withScratch(async (scratch) => {
                for (const rel of paths) {
                    const chain = (byPath.get(rel) ?? []).slice().sort((a, b) => a.seq - b.seq);
                    const steps = [];
                    const skips = new Set();
                    for (let index = 0; index < chain.length; index += 1) {
                        const call = chain[index];
                        steps.push({ path: rel, patch: await this.callPatch(provider, call) });
                        if (selected.has(call.callId))
                            skips.add(index);
                    }
                    const base = `${chain[0].commit}^`;
                    const replay = await replayPatches(provider, scratch, base, steps, skips);
                    for (const call of chain) {
                        const isSelected = selected.has(call.callId);
                        results.push({
                            modificationId: call.callId,
                            path: rel,
                            status: !isSelected ? 'restored' : replay.ok ? 'restored' : 'conflict',
                            ...(replay.ok || !isSelected || replay.reason === undefined ? {} : { detail: replay.reason }),
                        });
                    }
                    if (replay.ok)
                        restoredPaths.push(rel);
                    else
                        failedPaths.push(rel);
                }
            });
            if (failedPaths.length > 0) {
                await this.safety.restoreGuard(provider, guard, failedPaths).catch(() => undefined);
                await this.safety.journalUpdate(provider, journalId, 'rolled-back');
                return ok({
                    guardId: guard.guardId,
                    restored: restoredPaths,
                    kept: [],
                    deleted: [],
                    skipped: failedPaths,
                    modificationResults: results,
                });
            }
            await this.safety.journalUpdate(provider, journalId, 'completed');
            return ok({
                guardId: guard.guardId,
                restored: restoredPaths,
                kept: [],
                deleted: [],
                skipped: [],
                modificationResults: results,
                ...(request.scope === 'turn'
                    ? prepared.boundary.forkAtSeq !== undefined
                        ? { forkAnchor: prepared.boundary.forkAtSeq }
                        : { restart: true, cwd: prepared.cwd }
                    : {}),
            });
        }
        catch (error) {
            await this.safety.restoreGuard(provider, guard, paths).catch(() => undefined);
            await this.safety.journalUpdate(provider, journalId, 'rolled-back').catch(() => undefined);
            return fail('rollback-failed', String(error), { sessionId: request.sessionId, messageId: request.messageId, paths });
        }
    }
    /** One call's forward patch (`<commit>^` → `<commit>`), path-limited. */
    async callPatch(provider, call) {
        if (call.commit === undefined)
            return '';
        const result = await provider.run([
            'diff-tree', '-p', '--no-renames', '--full-index', '--unified=3',
            `${call.commit}^`, call.commit, '--', call.path,
        ]);
        return result.code === 0 ? result.stdout : '';
    }
    async executeFailure(error, request, prepared, guardId, journalId, affected) {
        const message = error instanceof Error ? error.message : String(error);
        const code = message.includes('workspace lock timeout') ? 'lock-timeout'
            : message.includes('running agent') ? 'agent-running'
                : message.includes('git operation') ? 'git-operation-in-progress'
                    : 'rollback-failed';
        let guardRolledBack = guardId === '';
        if (guardId !== '' && affected.size > 0) {
            try {
                const provider = this.snapshots.providerFor(prepared.cwd, prepared.sessionId);
                const guard = await this.safety.loadGuard(provider, guardId);
                if (guard !== undefined)
                    await this.safety.restoreGuard(provider, guard, [...affected]);
                guardRolledBack = true;
            }
            catch {
                // Interrupted guard rollback is surfaced through the journal.
            }
        }
        if (journalId !== undefined) {
            const provider = this.snapshots.providerFor(prepared.cwd, prepared.sessionId);
            await this.safety.journalUpdate(provider, journalId, guardRolledBack ? 'rolled-back' : 'interrupted').catch(() => undefined);
        }
        return fail(code, message, { sessionId: request.sessionId, messageId: request.messageId, paths: [...affected] });
    }
    finishGuard(_prepared, _guardId, _journalId) {
        // Kept as a small indirection point for future guard undoing; all journal
        // transitions happen at the mutation sites.
    }
}
async function pickBridgeEndpoint(abs) {
    const bridgesFile = process.env.DSHUI_BRIDGES_FILE;
    let best = null;
    if (bridgesFile !== undefined && bridgesFile !== '') {
        try {
            const parsed = JSON.parse(fs.readFileSync(bridgesFile, 'utf8'));
            for (const entry of Object.values(parsed)) {
                if (typeof entry.pid !== 'number' || !isAlive(entry.pid))
                    continue;
                if (typeof entry.workspace !== 'string' || entry.workspace === '' || typeof entry.endpoint !== 'string' || entry.endpoint === '')
                    continue;
                const prefix = entry.workspace.endsWith(path.sep) ? entry.workspace : `${entry.workspace}${path.sep}`;
                if (abs !== entry.workspace && !abs.startsWith(prefix))
                    continue;
                if (best === null || entry.workspace.length > best.workspace.length) {
                    best = {
                        workspace: entry.workspace,
                        endpoint: entry.endpoint,
                        ...(typeof entry.token === 'string' && entry.token !== '' ? { token: entry.token } : {}),
                    };
                }
            }
        }
        catch {
            // fall through to the owner endpoint
        }
    }
    if (best !== null)
        return { endpoint: best.endpoint, ...(best.token === undefined ? {} : { token: best.token }) };
    const endpoint = process.env.DSHUI_OPEN_ENDPOINT;
    if (endpoint === undefined || endpoint === '')
        return null;
    const token = process.env.DSHUI_OPEN_TOKEN;
    return { endpoint, ...(token === undefined || token === '' ? {} : { token }) };
}
function isAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
