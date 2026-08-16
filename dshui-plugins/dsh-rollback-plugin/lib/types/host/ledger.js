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
/**
 * Whole-file hunk for a file created after the baseline: `oldText: null`
 * plus the bounded text content, so the modification list can render the
 * new file as a diff. Binary or oversized files return no hunks.
 */
export async function createdFileHunks(abs, maxBytes) {
    try {
        const stat = await fs.promises.stat(abs);
        if (!stat.isFile() || stat.size > maxBytes)
            return [];
        const content = await fs.promises.readFile(abs, 'utf8');
        if (content.includes('\0'))
            return [];
        return wholeFileHunk(null, content);
    }
    catch {
        return [];
    }
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
/** Context lines kept around each changed region, like `git diff`'s default. */
const DIFF_CONTEXT = 3;
/** Guard against pathological LCS tables; larger middles fall back to one whole-file hunk. */
const DIFF_MAX_LCS_CELLS = 1_000_000;
/**
 * Line-level diff between two text snapshots, split into git-style hunks
 * (with context) so per-hunk CodeLens buttons and precise change anchors
 * work for ledger-tracked files too. `firstChanged*Line` marks the first
 * line that actually differs inside each hunk.
 */
export function lineDiffHunks(before, after) {
    if (before === after)
        return [];
    if (before === '' || after === '')
        return wholeFileHunk(before, after);
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    let prefix = 0;
    while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix])
        prefix += 1;
    let suffix = 0;
    while (suffix < beforeLines.length - prefix && suffix < afterLines.length - prefix
        && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix])
        suffix += 1;
    const midBefore = beforeLines.slice(prefix, beforeLines.length - suffix);
    const midAfter = afterLines.slice(prefix, afterLines.length - suffix);
    if (midBefore.length === 0 && midAfter.length === 0)
        return [];
    if (midBefore.length * midAfter.length > DIFF_MAX_LCS_CELLS) {
        // Degenerate middle: fall back to one whole-file hunk, but still point
        // the change anchor at the first differing line (the common prefix).
        return [{
                oldText: before,
                newText: after,
                oldLine: 1,
                newLine: 1,
                endLine: countLines(after),
                firstChangedOldLine: prefix + 1,
                firstChangedNewLine: prefix + 1,
            }];
    }
    // Backward LCS table over the trimmed middle.
    const n = midBefore.length;
    const m = midAfter.length;
    const stride = m + 1;
    const dp = new Int32Array((n + 1) * stride);
    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            dp[i * stride + j] = midBefore[i] === midAfter[j]
                ? dp[(i + 1) * stride + j + 1] + 1
                : Math.max(dp[(i + 1) * stride + j], dp[i * stride + j + 1]);
        }
    }
    const ops = [];
    let oldCursor = 1;
    let newCursor = 1;
    for (let k = 0; k < prefix; k += 1) {
        ops.push({ type: 'keep', oldLine: oldCursor, newLine: newCursor });
        oldCursor += 1;
        newCursor += 1;
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && midBefore[i] === midAfter[j]) {
            ops.push({ type: 'keep', oldLine: oldCursor, newLine: newCursor });
            i += 1;
            j += 1;
            oldCursor += 1;
            newCursor += 1;
        }
        else if (j >= m || (i < n && dp[(i + 1) * stride + j] >= dp[i * stride + j + 1])) {
            ops.push({ type: 'del', oldLine: oldCursor, newLine: newCursor });
            i += 1;
            oldCursor += 1;
        }
        else {
            ops.push({ type: 'ins', oldLine: oldCursor, newLine: newCursor });
            j += 1;
            newCursor += 1;
        }
    }
    // The common suffix was trimmed before the LCS; append it as keeps so the
    // final hunk still gets its trailing context lines.
    for (let k = 0; k < suffix; k += 1) {
        ops.push({ type: 'keep', oldLine: oldCursor, newLine: newCursor });
        oldCursor += 1;
        newCursor += 1;
    }
    // Group change runs into hunks: runs separated by more than 2×context
    // unchanged lines get their own hunk (git-style); closer runs share one.
    const hunks = [];
    let firstChange = -1;
    let lastChange = -1;
    const flush = (first, last) => {
        const hunkStart = Math.max(0, first - DIFF_CONTEXT);
        const hunkEnd = Math.min(ops.length - 1, last + DIFF_CONTEXT);
        const oldLines = [];
        const newLines = [];
        let hunkOldLine = 0;
        let hunkNewLine = 0;
        let firstChangedOld;
        let firstChangedNew;
        for (let k = hunkStart; k <= hunkEnd; k += 1) {
            const op = ops[k];
            if (op.type !== 'ins') {
                oldLines.push(beforeLines[op.oldLine - 1] ?? '');
                if (hunkOldLine === 0)
                    hunkOldLine = op.oldLine;
                if (k >= first && firstChangedOld === undefined)
                    firstChangedOld = op.oldLine;
            }
            if (op.type !== 'del') {
                newLines.push(afterLines[op.newLine - 1] ?? '');
                if (hunkNewLine === 0)
                    hunkNewLine = op.newLine;
                if (k >= first && firstChangedNew === undefined)
                    firstChangedNew = op.newLine;
            }
        }
        const newCount = newLines.length;
        hunks.push({
            oldText: oldLines.join('\n'),
            newText: newLines.join('\n'),
            oldLine: hunkOldLine,
            newLine: hunkNewLine,
            ...(newCount > 0 ? { endLine: hunkNewLine + newCount - 1 } : {}),
            ...(firstChangedOld === undefined ? {} : { firstChangedOldLine: firstChangedOld }),
            ...(firstChangedNew === undefined ? {} : { firstChangedNewLine: firstChangedNew }),
        });
    };
    for (let k = 0; k < ops.length; k += 1) {
        if (ops[k].type === 'keep')
            continue;
        // A change op starts a new hunk when the unchanged lines since the last
        // change exceed the merge threshold. (Checked on change ops, not keeps:
        // the gap is the distance between two change runs.)
        if (firstChange >= 0 && k - lastChange - 1 > 2 * DIFF_CONTEXT) {
            flush(firstChange, lastChange);
            firstChange = -1;
        }
        if (firstChange < 0)
            firstChange = k;
        lastChange = k;
    }
    if (firstChange >= 0)
        flush(firstChange, lastChange);
    return hunks;
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
    /** All records for one path in a session, oldest first. */
    recordsForPath(sessionId, filePath) {
        return this.list(sessionId)
            .filter(record => samePath(record.path, filePath))
            .sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt);
    }
    /** Earliest record for one path across the whole session. */
    earliestForSessionPath(sessionId, filePath) {
        return this.recordsForPath(sessionId, filePath)[0];
    }
    /**
     * File-level changes for every ledger-covered path of a session, using the
     * earliest record per path as the baseline (the session modification list).
     */
    async buildSessionFileChanges(sessionId, cwd, mode) {
        const result = [];
        const seen = new Set();
        for (const record of this.list(sessionId)) {
            const rel = relPathWithin(cwd, record.path);
            if (rel === undefined || seen.has(rel))
                continue;
            seen.add(rel);
            const baseline = this.earliestForSessionPath(sessionId, record.path);
            if (baseline === undefined)
                continue;
            const change = await this.fileChangeForBaseline(cwd, rel, baseline, mode);
            if (change !== undefined)
                result.push(change);
        }
        return result;
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
                if (currentInfo === undefined)
                    return undefined;
                const hunks = await createdFileHunks(this.ctx.fs.processPath(target), this.options.ledgerMaxTextBytes);
                return {
                    path: rel,
                    absolutePath: this.ctx.fs.processPath(target),
                    status: mode === 'ignored' ? 'ignored' : 'created',
                    source: 'ledger',
                    restorable: false,
                    createdAfterSnapshot: true,
                    ...(hunks.length > 0 ? { hunks } : {}),
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
                hunks: lineDiffHunks(baseline.beforeContent, current),
            };
        }
        catch {
            return undefined;
        }
    }
    /** Restore one ledger-covered path through ctx.fs, bypassing the tool waterfall. */
    async restoreLedgerPath(cwd, rel, baseline, createdPolicy, sandboxPolicy) {
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
        await this.ctx.fs.writeText(target, baseline.beforeContent, info === undefined ? { kind: 'createIfAbsent' } : { kind: 'replaceIfVersion', version: info.version }, undefined, sandboxPolicy);
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
    async restoreGuardFile(cwd, rel, guard, sandboxPolicy) {
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
        await this.ctx.fs.writeText(target, guard.content, info === undefined ? { kind: 'createIfAbsent' } : { kind: 'replaceIfVersion', version: info.version }, undefined, sandboxPolicy);
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
