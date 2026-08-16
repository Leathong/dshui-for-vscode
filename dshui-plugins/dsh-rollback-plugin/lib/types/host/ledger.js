import * as fs from 'node:fs';
import * as path from 'node:path';
import { changeLedgerRoot, writeJsonFileAtomic } from "./snapshot.js";
function jsonSafe(value) {
    try {
        const text = JSON.stringify(value);
        return text === undefined ? undefined : text;
    }
    catch {
        return undefined;
    }
}
function safePathKey(target) {
    return target.targetKey;
}
export function normalizeLf(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
/** Compute a whole-file diff hunk between two text snapshots. */
export function wholeFileHunk(before, after) {
    if (before === null) {
        return [{ oldText: null, newText: after, newLine: 1, endLine: countLines(after) }];
    }
    if (before === after)
        return [];
    return [{
            oldText: before,
            newText: after,
            oldLine: 1,
            newLine: 1,
            endLine: countLines(after),
        }];
}
function countLines(text) {
    if (text === '')
        return 1;
    return text.split('\n').length;
}
/** Open turn/step for a session, derived from the durable log boundaries. */
export function sessionTurnPosition(session) {
    let turn = 0;
    let step = 0;
    let seq = -1;
    for (const event of session.events) {
        seq = event.seq;
        if (event.type === 'turn/start')
            turn = event.data.turn;
        if (event.type === 'step/start')
            step = event.data.step;
    }
    return turn > 0 ? { turn, step, seq } : undefined;
}
/** Persistence file for ledger records (JSON fallback next to the manifests). */
export function ledgerRecordsPath() {
    return path.join(changeLedgerRoot(), 'v1', 'ledger.json');
}
function readJsonFileSync(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch {
        return fallback;
    }
}
function trimRecords(records, maxPerSession) {
    const bySession = new Map();
    for (const record of records) {
        const list = bySession.get(record.sessionId) ?? [];
        list.push(record);
        bySession.set(record.sessionId, list);
    }
    const result = [];
    for (const list of bySession.values())
        result.push(...list.slice(-maxPerSession));
    return result;
}
export class ChangeLedger {
    ctx;
    options;
    records = [];
    pending = new Map();
    writeTail = Promise.resolve();
    maxLedgerRecordsPerSession;
    ledgerFile;
    constructor(ctx, options) {
        this.ctx = ctx;
        this.options = options;
        this.maxLedgerRecordsPerSession = options.maxLedgerRecordsPerSession ?? 500;
        this.ledgerFile = options.ledgerFile ?? ledgerRecordsPath();
        this.records.push(...readJsonFileSync(this.ledgerFile, []));
    }
    get ledgerMaxTextBytes() {
        return this.options.ledgerMaxTextBytes;
    }
    /** Prepend listener for fs/write-intent; must call next() so the policy slot stays intact. */
    async captureWriteBefore(target, actor, next) {
        await this.captureBefore('write', target, actor);
        return await next();
    }
    /** Prepend listener for fs/edit-intent; must call next() so the policy slot stays intact. */
    async captureEditBefore(target, actor, next) {
        await this.captureBefore('edit', target, actor);
        return await next();
    }
    /** Record a successful fs observation against a pending write/edit capture. */
    observe(target, observation, actor) {
        if (observation.kind !== 'present')
            return;
        const key = safePathKey(target);
        const list = this.pending.get(key);
        if (list === undefined || list.length === 0)
            return;
        const index = list.findIndex(item => actor?.callId !== undefined && item.modificationId === actor.callId);
        const selected = index >= 0 ? list[index] : list[list.length - 1];
        if (selected === undefined)
            return;
        if (index >= 0)
            list.splice(index, 1);
        else
            list.pop();
        if (list.length === 0)
            this.pending.delete(key);
        const session = actor?.agent?.session;
        const position = session === undefined ? undefined : this.positionForCall(session, selected.modificationId);
        const fallback = session === undefined ? undefined : sessionTurnPosition(session);
        const turn = position?.turn ?? fallback?.turn ?? 0;
        const step = position?.step ?? fallback?.step ?? 0;
        const seq = position?.seq ?? fallback?.seq ?? -1;
        // argsRaw mirrors the same size bound as the before-image: oversized tool
        // arguments (e.g. a multi-megabyte write) are not persisted, keeping every
        // record within ledgerMaxTextBytes while single-modification restore for
        // such files is unsupported anyway (their before-image is absent too).
        const argsRaw = selected.actorArguments === undefined ? undefined : jsonSafe(selected.actorArguments);
        this.records.push({
            modificationId: selected.modificationId,
            toolName: selected.toolName,
            path: selected.path,
            sessionId: selected.sessionId,
            turn,
            step,
            seq,
            ...(argsRaw === undefined || argsRaw.length > this.options.ledgerMaxTextBytes ? {} : { argsRaw }),
            beforeExisted: selected.beforeExisted,
            ...(selected.beforeVersion === undefined ? {} : { beforeVersion: selected.beforeVersion }),
            ...(selected.beforeContent === undefined ? {} : { beforeContent: selected.beforeContent }),
            ...(selected.beforeBinary === true ? { beforeBinary: true } : {}),
            observedVersion: observation.version,
            createdAt: Date.now(),
        });
        this.enqueuePersist();
    }
    list(sessionId) {
        return sessionId === undefined
            ? [...this.records]
            : this.records.filter(record => record.sessionId === sessionId);
    }
    listForTurn(sessionId, turn) {
        return this.records
            .filter(record => record.sessionId === sessionId && record.turn === turn)
            .sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt);
    }
    /** Earliest before-image for one path during the target turn. */
    baselineForTurn(sessionId, turn, filePath) {
        const matches = this.listForTurn(sessionId, turn)
            .filter(record => samePath(record.path, filePath));
        return matches[0];
    }
    /** All modifications for a path at or after one record, newest first. */
    laterModifications(sessionId, filePath, after) {
        return this.list(sessionId)
            .filter(record => samePath(record.path, filePath) && record.createdAt > after.createdAt)
            .sort((a, b) => b.createdAt - a.createdAt);
    }
    recordById(sessionId, modificationId) {
        return this.records.find(record => record.sessionId === sessionId && record.modificationId === modificationId);
    }
    /** Await pending persistence (tests and graceful shutdown paths). */
    async flush() {
        await this.writeTail.catch(() => undefined);
    }
    enqueuePersist() {
        const trimmed = trimRecords(this.records, this.maxLedgerRecordsPerSession);
        this.records.length = 0;
        this.records.push(...trimmed);
        this.writeTail = this.writeTail
            .catch(() => undefined)
            .then(async () => {
            await writeJsonFileAtomic(this.ledgerFile, this.records);
        })
            .catch((error) => {
            this.ctx.logger.warn('rollback ledger persist failed:', error);
        });
    }
    /** Build file-level changes for ledger-covered paths that git snapshots cannot see. */
    async buildFileChanges(sessionId, turn, cwd, mode) {
        const result = [];
        const seen = new Set();
        for (const record of this.listForTurn(sessionId, turn)) {
            const rel = relPathWithin(cwd, record.path);
            if (rel === undefined || seen.has(rel))
                continue;
            seen.add(rel);
            const change = await this.fileChangeForBaseline(cwd, rel, record, mode);
            if (change !== undefined)
                result.push(change);
        }
        return result;
    }
    async fileChangeForBaseline(cwd, rel, baseline, mode) {
        try {
            const target = await this.ctx.fs.resolve(rel, { cwd });
            const currentInfo = await this.ctx.fs.stat(target);
            if (!baseline.beforeExisted) {
                return {
                    path: rel,
                    absolutePath: this.ctx.fs.processPath(target),
                    status: mode === 'ignored' ? 'ignored' : 'created',
                    source: 'ledger',
                    restorable: false,
                    createdAfterSnapshot: true,
                };
            }
            if (currentInfo === undefined) {
                return {
                    path: rel,
                    absolutePath: path.resolve(cwd, rel),
                    status: 'deleted',
                    source: 'ledger',
                    restorable: baseline.beforeContent !== undefined,
                    ...(baseline.beforeContent !== undefined ? { hunks: wholeFileHunk(baseline.beforeContent, '') } : {}),
                };
            }
            if (baseline.beforeContent === undefined) {
                return {
                    path: rel,
                    absolutePath: this.ctx.fs.processPath(target),
                    status: mode === 'ignored' ? 'ignored' : 'binary',
                    source: 'ledger',
                    restorable: false,
                    binary: true,
                };
            }
            const current = await this.readText(target);
            if (current === undefined) {
                return {
                    path: rel,
                    absolutePath: this.ctx.fs.processPath(target),
                    status: mode === 'ignored' ? 'ignored' : 'binary',
                    source: 'ledger',
                    restorable: false,
                    binary: true,
                };
            }
            if (current === baseline.beforeContent)
                return undefined;
            return {
                path: rel,
                absolutePath: this.ctx.fs.processPath(target),
                status: mode === 'ignored' ? 'ignored' : 'modified',
                source: 'ledger',
                restorable: true,
                hunks: wholeFileHunk(baseline.beforeContent, current),
            };
        }
        catch {
            return undefined;
        }
    }
    /** Restore one ledger-covered path through ctx.fs, bypassing the tool waterfall. */
    async restoreLedgerPath(cwd, rel, baseline, createdPolicy) {
        const target = await this.ctx.fs.resolve(rel, { cwd });
        if (!baseline.beforeExisted) {
            if (createdPolicy !== 'delete')
                return 'kept';
            const info = await this.ctx.fs.stat(target);
            if (info === undefined)
                return 'deleted';
            fs.rmSync(this.ctx.fs.processPath(target), { force: true });
            return 'deleted';
        }
        const info = await this.ctx.fs.stat(target);
        if (baseline.beforeContent === undefined)
            return 'unsupported';
        await this.ctx.fs.writeText(target, baseline.beforeContent, info === undefined ? { kind: 'createIfAbsent' } : { kind: 'replaceIfVersion', version: info.version });
        return 'restored';
    }
    async readCurrentForGuard(cwd, rel) {
        try {
            const target = await this.ctx.fs.resolve(rel, { cwd });
            const info = await this.ctx.fs.stat(target);
            if (info === undefined)
                return { existed: false };
            const content = info.type === 'file' && (info.size ?? 0) <= this.options.ledgerMaxTextBytes
                ? await this.readText(target)
                : undefined;
            return { existed: true, version: info.version, size: info.size, ...(content === undefined ? {} : { content }) };
        }
        catch {
            return { existed: false };
        }
    }
    async restoreGuardFile(cwd, rel, guard) {
        const target = await this.ctx.fs.resolve(rel, { cwd });
        if (!guard.existed) {
            const info = await this.ctx.fs.stat(target);
            if (info !== undefined)
                fs.rmSync(this.ctx.fs.processPath(target), { force: true });
            return;
        }
        if (guard.content === undefined)
            return;
        const info = await this.ctx.fs.stat(target);
        await this.ctx.fs.writeText(target, guard.content, info === undefined ? { kind: 'createIfAbsent' } : { kind: 'replaceIfVersion', version: info.version });
    }
    async captureBefore(toolName, target, actor) {
        const filePath = this.ctx.fs.processPath(target);
        const modificationId = actor?.callId;
        if (modificationId === undefined || actor?.agent?.session === undefined)
            return;
        let info;
        let beforeContent;
        let beforeBinary = false;
        try {
            info = await this.ctx.fs.stat(target);
            if (info !== undefined && info.type === 'file' && (info.size ?? 0) <= this.options.ledgerMaxTextBytes) {
                beforeContent = await this.ctx.fs.readText(target);
            }
            else if (info !== undefined && info.type === 'file') {
                beforeBinary = true;
            }
        }
        catch {
            try {
                info = await this.ctx.fs.stat(target);
                if (info !== undefined)
                    beforeBinary = true;
            }
            catch {
                info = undefined;
            }
        }
        const pending = {
            modificationId,
            toolName,
            path: filePath,
            sessionId: actor.agent.session.id,
            ...(actor.arguments === undefined ? {} : { actorArguments: actor.arguments }),
            beforeExisted: info !== undefined,
            ...(info?.version === undefined ? {} : { beforeVersion: info.version }),
            ...(beforeContent === undefined ? {} : { beforeContent }),
            ...(beforeBinary ? { beforeBinary: true } : {}),
        };
        const key = safePathKey(target);
        const list = this.pending.get(key) ?? [];
        list.push(pending);
        this.pending.set(key, list);
    }
    positionForCall(session, callId) {
        for (const event of [...session.events].reverse()) {
            if (event.type !== 'tool/call')
                continue;
            const data = event.data;
            if (data.callId === callId)
                return { turn: data.turn ?? 0, step: data.step ?? 0, seq: event.seq };
        }
        return undefined;
    }
    async readText(target) {
        try {
            return await this.ctx.fs.readText(target);
        }
        catch {
            return undefined;
        }
    }
}
function samePath(left, right) {
    return path.resolve(left) === path.resolve(right);
}
function relPathWithin(cwd, abs) {
    const rel = path.relative(cwd, abs);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
        return undefined;
    return rel.split(path.sep).join('/');
}
