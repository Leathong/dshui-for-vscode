import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ok, fail } from "./errors.js";
import { resolveBoundary, resolveBoundaryForTurn, boundaryInfo } from "./boundary.js";
import { sandboxPolicyFor, sandboxPolicyForCwd } from "./fs-policy.js";
import { wholeFileHunk } from "./ledger.js";
import { restoreModification } from "./modification.js";
import { LedgerProvider } from "./providers/ledger-fallback.js";
export class RollbackRestore {
    ctx;
    snapshots;
    ledger;
    safety;
    options;
    prepared = new Map();
    constructor(ctx, snapshots, ledger, safety, options) {
        this.ctx = ctx;
        this.snapshots = snapshots;
        this.ledger = ledger;
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
        const found = await this.snapshots.find(sessionId, boundary.targetTurn);
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
            warnings.push('the isolated snapshot store is unavailable; only ledger-covered paths are shown');
        }
        const ledgerProvider = new LedgerProvider(this.ctx, this.ledger);
        const merged = await ledgerProvider.mergeChanges(sessionId, found.manifest.turn, cwd, changes, gitAvailable && found.manifest.tree !== undefined);
        changes = merged.changes;
        warnings.push(...merged.warnings);
        const modifications = this.buildModifications(sessionId, found.manifest.turn, cwd, session.events);
        this.attachToolCalls(changes, modifications);
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
            const policy = sandboxPolicyFor(this.ctx, session);
            if (request.scope === 'modifications') {
                return await this.executeModifications(prepared, request, provider, guardTree, affected, policy, () => this.finishGuard(prepared, guardId, journalId));
            }
            const selected = await this.selectFilePaths(prepared, request, provider);
            if (!selected.ok)
                return selected;
            for (const item of selected.value.all)
                affected.add(item);
            const ledgerPaths = selected.value.ledger.map(item => item.rel);
            guardId = (await this.safety.captureGuard(this.ctx, provider, prepared.cwd, guardTree, ledgerPaths, this.ledger, prepared.sessionId)).guardId;
            journalId = (await this.safety.journalStart(guardId, selected.value.all)).id;
            const restored = [];
            const kept = [];
            const deleted = [];
            const skipped = [];
            try {
                const gitRestore = selected.value.git.filter(item => item.inSnapshot);
                const gitCreated = selected.value.git.filter(item => !item.inSnapshot);
                await provider.restorePaths(prepared.snapshot.tree ?? '', gitRestore.map(item => item.rel));
                for (const rel of gitRestore.map(item => item.rel)) {
                    const expected = await provider.blobHash(prepared.snapshot.tree ?? '', rel);
                    const actual = await provider.fileHash(rel);
                    if (expected !== actual)
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
                for (const item of selected.value.ledger) {
                    const baseline = this.ledger.baselineForTurn(request.sessionId, prepared.snapshot.turn, item.abs ?? item.rel);
                    if (baseline === undefined) {
                        if (request.createdPolicy === 'delete') {
                            const abs = item.abs ?? provider.absolutePath(item.rel);
                            if (fs.existsSync(abs)) {
                                fs.rmSync(abs, { force: true });
                                deleted.push(item.rel);
                            }
                            else {
                                skipped.push(item.rel);
                            }
                        }
                        else {
                            kept.push(item.rel);
                        }
                        continue;
                    }
                    const outcome = await this.ledger.restoreLedgerPath(prepared.cwd, item.rel, baseline, request.createdPolicy ?? 'keep', policy);
                    if (outcome === 'restored')
                        restored.push(item.rel);
                    else if (outcome === 'deleted')
                        deleted.push(item.rel);
                    else if (outcome === 'kept')
                        kept.push(item.rel);
                    else
                        skipped.push(item.rel);
                }
                await this.safety.journalUpdate(journalId, 'completed');
                return ok({
                    guardId,
                    restored,
                    kept,
                    deleted,
                    skipped,
                    ...(request.scope === 'turn' ? { forkAnchor: prepared.boundary.forkAtSeq } : {}),
                });
            }
            catch (error) {
                await this.safety.rollbackGuard(this.ctx, provider, this.ledger, guardId, selected.value.all, policy).catch(() => undefined);
                await this.safety.journalUpdate(journalId, 'rolled-back').catch(() => undefined);
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
            journal: await this.safety.listJournals(cwd),
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
        const requested = request.scope === 'files' && request.paths !== undefined && request.paths.length > 0
            ? request.paths
            : undefined;
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
        const ledger = [];
        for (const change of changes) {
            const rel = change.path;
            all.push(rel);
            if (change.source === 'ledger') {
                ledger.push({ rel, abs: change.absolutePath });
                continue;
            }
            let inSnapshot = false;
            if (prepared.snapshot.tree !== undefined) {
                const paths = await provider.pathsInTree(prepared.snapshot.tree, rel);
                inSnapshot = paths.includes(rel);
            }
            git.push({ rel, inSnapshot });
        }
        return ok({ all, git, ledger });
    }
    buildModifications(sessionId, turn, cwd, events) {
        return buildModificationsFromRecords(cwd, events, this.ledger.listForTurn(sessionId, turn), record => this.ledger.laterModifications(sessionId, record.path, record), turn);
    }
    attachToolCalls(changes, modifications) {
        attachToolCallsToChanges(changes, modifications);
    }
    async executeModifications(prepared, request, provider, guardTree, affected, policy, _finish) {
        const ids = request.modificationIds ?? [];
        if (ids.length === 0)
            return fail('rollback-failed', 'scope=modifications requires modificationIds');
        const selected = ids.map(id => this.ledger.recordById(request.sessionId, id)).filter((record) => record !== undefined);
        if (selected.length === 0)
            return fail('rollback-failed', 'none of the requested modifications are available', { sessionId: request.sessionId, messageId: request.messageId });
        const byPath = new Map();
        for (const record of selected) {
            if (record.turn !== prepared.snapshot.turn)
                continue;
            const rel = path.relative(prepared.cwd, record.path);
            if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
                continue;
            const list = byPath.get(rel) ?? [];
            list.push(record);
            byPath.set(rel, list);
        }
        const paths = [...byPath.keys()];
        for (const item of paths)
            affected.add(item);
        const guard = await this.safety.captureGuard(this.ctx, provider, prepared.cwd, guardTree, paths, this.ledger, prepared.sessionId);
        const journalId = (await this.safety.journalStart(guard.guardId, paths)).id;
        const results = [];
        const restoredPaths = [];
        try {
            for (const [rel, records] of byPath) {
                records.sort((a, b) => b.seq - a.seq || b.createdAt - a.createdAt);
                const fileGuard = await this.ledger.readCurrentForGuard(prepared.cwd, rel);
                let failed = false;
                for (const record of records) {
                    const outcome = await restoreModification(this.ctx, this.ledger, prepared.cwd, record, request.createdPolicy === 'delete', this.options.spawnTimeoutMs, policy);
                    results.push({
                        modificationId: record.modificationId,
                        path: rel,
                        status: outcome.status,
                        ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
                    });
                    if (outcome.status === 'conflict' || outcome.status === 'failed' || outcome.status === 'unsupported') {
                        failed = true;
                        break;
                    }
                }
                if (failed) {
                    for (const record of records) {
                        const existing = results.find(item => item.modificationId === record.modificationId);
                        if (existing !== undefined && existing.status === 'restored')
                            existing.status = 'conflict';
                    }
                    await this.ledger.restoreGuardFile(prepared.cwd, rel, fileGuard, policy).catch(() => undefined);
                }
                else {
                    restoredPaths.push(rel);
                }
            }
            await this.safety.journalUpdate(journalId, 'completed');
            return ok({
                guardId: guard.guardId,
                restored: restoredPaths,
                kept: [],
                deleted: results.filter(item => item.status === 'restored' && item.detail?.includes('deleted')).map(item => item.path),
                skipped: [],
                modificationResults: results,
                ...(request.scope === 'turn' ? { forkAnchor: prepared.boundary.forkAtSeq } : {}),
            });
        }
        catch (error) {
            await this.safety.rollbackGuard(this.ctx, provider, this.ledger, guard.guardId, paths, policy).catch(() => undefined);
            await this.safety.journalUpdate(journalId, 'rolled-back').catch(() => undefined);
            return fail('rollback-failed', String(error), { sessionId: request.sessionId, messageId: request.messageId, paths });
        }
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
                const liveSession = this.ctx.sessions.get(request.sessionId);
                const policy = liveSession === undefined ? sandboxPolicyForCwd(prepared.cwd) : sandboxPolicyFor(this.ctx, liveSession);
                await this.safety.rollbackGuard(this.ctx, provider, this.ledger, guardId, [...affected], policy);
                guardRolledBack = true;
            }
            catch {
                // Interrupted guard rollback is surfaced through the journal.
            }
        }
        if (journalId !== undefined) {
            await this.safety.journalUpdate(journalId, guardRolledBack ? 'rolled-back' : 'interrupted').catch(() => undefined);
        }
        return fail(code, message, { sessionId: request.sessionId, messageId: request.messageId, paths: [...affected] });
    }
    finishGuard(_prepared, _guardId, _journalId) {
        // Kept as a small indirection point for future guard undoing; all journal
        // transitions happen at the mutation sites.
    }
}
export function parseRecordArgs(raw) {
    if (raw === undefined)
        return {};
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
    }
    catch {
        return {};
    }
}
/** Reusable modification builder: ledger records + log-only write/edit events. */
export function buildModificationsFromRecords(cwd, events, records, later, turn) {
    const recorded = new Set(records.map(item => item.modificationId));
    const result = [];
    for (const event of events) {
        if (event.type !== 'tool/call')
            continue;
        const data = event.data;
        if (turn !== undefined && data.turn !== turn)
            continue;
        if (data.callId === undefined || data.name !== 'write' && data.name !== 'edit')
            continue;
        if (recorded.has(data.callId))
            continue;
        const args = parseRecordArgs(data.arguments);
        const filePath = typeof args.file_path === 'string' ? args.file_path : typeof args.filePath === 'string' ? args.filePath : undefined;
        if (filePath === undefined)
            continue;
        const rel = path.relative(cwd, filePath);
        if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
            continue;
        const toolResult = events.find(candidate => candidate.type === 'tool/result'
            && candidate.data.turn === data.turn
            && resultEventCallId(candidate) === data.callId);
        result.push({
            modificationId: data.callId,
            toolName: data.name,
            path: rel.split(path.sep).join('/'),
            turn: data.turn ?? 0,
            step: data.step ?? 0,
            seq: event.seq,
            hunks: sessionLogHunks(toolResult, args),
            restorable: 'unsupported',
            reason: 'no live ledger before-image for this modification',
        });
        recorded.add(data.callId);
    }
    for (const record of records) {
        const rel = path.relative(cwd, record.path);
        if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
            continue;
        result.push({
            modificationId: record.modificationId,
            toolName: record.toolName,
            path: rel.split(path.sep).join('/'),
            turn: record.turn,
            step: record.step,
            seq: record.seq,
            hunks: recordHunks(record),
            restorable: record.beforeExisted
                ? record.beforeContent !== undefined ? 'merge' : 'unsupported'
                : 'file-only',
            ...(record.beforeExisted && record.beforeContent === undefined ? { reason: 'no bounded text before-image' } : {}),
            ...(!record.beforeExisted ? { createdFile: true, reason: 'file was created by this modification; undoing it requires delete confirmation' } : {}),
            laterModificationIds: later(record).map(item => item.modificationId),
        });
    }
    return result.sort((a, b) => a.seq - b.seq || a.turn - b.turn || a.step - b.step);
}
/** Attach per-path tool-call patch lists onto file-level changes. */
export function attachToolCallsToChanges(changes, modifications) {
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
function resultEventCallId(event) {
    if (event.type !== 'tool/result')
        return undefined;
    const data = event.data;
    return data.message?.source?.callId;
}
export function sessionLogHunks(event, args) {
    if (event !== undefined && event.type === 'tool/result') {
        const data = event.data;
        const diffs = data.meta?.diffs;
        if (diffs !== undefined && diffs.length > 0) {
            return diffs.map(item => ({
                oldText: typeof item.oldText === 'string' ? item.oldText : null,
                newText: typeof item.newText === 'string' ? item.newText : '',
                ...(item.path === undefined ? {} : { path: item.path }),
            })).filter(item => item.newText !== '');
        }
    }
    if (typeof args.content === 'string')
        return [{ oldText: null, newText: args.content }];
    const oldString = typeof args.old_string === 'string' ? args.old_string : typeof args.oldString === 'string' ? args.oldString : undefined;
    const newString = typeof args.new_string === 'string' ? args.new_string : typeof args.newString === 'string' ? args.newString : '';
    return oldString === undefined ? [] : [{ oldText: oldString, newText: newString }];
}
export function recordHunks(record) {
    let args = {};
    if (record.argsRaw !== undefined) {
        try {
            const parsed = JSON.parse(record.argsRaw);
            if (typeof parsed === 'object' && parsed !== null)
                args = parsed;
        }
        catch {
            // fall through
        }
    }
    if (record.toolName === 'write') {
        const content = typeof args.content === 'string' ? args.content : '';
        return wholeFileHunk(record.beforeExisted ? record.beforeContent ?? null : null, content);
    }
    const oldString = typeof args.old_string === 'string' ? args.old_string : typeof args.oldString === 'string' ? args.oldString : undefined;
    const newString = typeof args.new_string === 'string' ? args.new_string : typeof args.newString === 'string' ? args.newString : '';
    if (oldString === undefined)
        return [];
    return [{ oldText: oldString, newText: newString, oldLine: 1, newLine: 1 }];
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
