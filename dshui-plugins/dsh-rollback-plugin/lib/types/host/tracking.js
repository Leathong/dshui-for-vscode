import * as fs from 'node:fs';
import * as path from 'node:path';
import { attributionSession } from "./attribution.js";
/**
 * Per-call tracking: one write/edit tool call becomes one commit on
 * `refs/dsh/head`, built entirely from git objects (docs/git-only-plan.md §2.2,
 * §2.3).
 *
 * The hot path is a single `git hash-object -w` per call; the blob hash and the
 * call metadata stay in memory until `flush()` freezes them into the chain with
 * one `git fast-import`. Nothing is written to JSON, and no ref moves per call —
 * so the former per-modification ledger rewrite (and its write amplification)
 * is gone.
 *
 * Known limitation: two *concurrent* calls writing the same path can be hashed
 * out of order, so the earlier call may record the later call's content. This
 * cannot be repaired after the fact (the intermediate content is already gone);
 * it only affects which of the two patches appears to carry the change, never
 * the final state.
 */
export const CHAIN_HEAD_REF = 'refs/dsh/head';
/**
 * The session's *list* base: the tree captured at its first turn start. Unlike
 * `head` this ref never moves, so the accepted-file list can be diffed against
 * it after a host restart, when the in-memory anchor (`track.base`) is either
 * gone or has been re-pointed at the chain tip.
 */
export const CHAIN_BASE_REF = 'refs/dsh/base';
const DEFAULT_MAX_CALLS = 500;
/** key=value lines recorded in each commit message (parsed back by `loadCalls`). */
function encodeMessage(call) {
    return [
        `callId=${call.callId}`,
        `tool=${call.toolName}`,
        `turn=${call.turn}`,
        `step=${call.step}`,
        `seq=${call.seq}`,
        `paths=${call.path}`,
        ...(call.deleted === true ? ['deleted=1'] : []),
        '',
    ].join('\n');
}
function decodeMessage(commit, message) {
    const fields = new Map();
    for (const line of message.split('\n')) {
        const index = line.indexOf('=');
        if (index <= 0)
            continue;
        fields.set(line.slice(0, index), line.slice(index + 1));
    }
    const callId = fields.get('callId');
    const callPath = fields.get('paths');
    if (callId === undefined || callPath === undefined)
        return undefined;
    const deleted = fields.get('deleted') === '1';
    return {
        callId,
        toolName: fields.get('tool') ?? 'unknown',
        path: callPath,
        turn: Number(fields.get('turn') ?? '0') || 0,
        step: Number(fields.get('step') ?? '0') || 0,
        seq: Number(fields.get('seq') ?? '-1'),
        timestamp: 0,
        ...(deleted ? { deleted: true } : {}),
        commit,
    };
}
export class CallTracker {
    ctx;
    snapshots;
    options;
    tracks = new Map();
    maxCalls;
    constructor(ctx, snapshots, options) {
        this.ctx = ctx;
        this.snapshots = snapshots;
        this.options = options;
        this.maxCalls = Math.max(1, options.maxCallsPerSession ?? DEFAULT_MAX_CALLS);
    }
    /**
     * Record one observed write/edit. Synchronous by contract (`fs/observed` is a
     * synchronous event); the blob write runs on the session's serial queue.
     *
     * Paths inside a nested git repository are tracked like any other: the call is
     * captured from the file's bytes, so the embedded worktree never has to be
     * indexed (the list path stages those paths from their blob).
     */
    observe(target, observation, actor) {
        const callId = actor?.callId;
        const toolName = actor?.name;
        const agentSession = actor?.agent?.session;
        if (callId === undefined || agentSession === undefined)
            return;
        if (toolName !== 'write' && toolName !== 'edit')
            return;
        const session = attributionSession(this.ctx, agentSession);
        const cwd = session.header?.cwd;
        if (cwd === undefined || cwd === '')
            return;
        const abs = this.ctx.fs.processPath(target);
        const rel = path.relative(cwd, abs);
        if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
            return;
        const relPath = rel.split(path.sep).join('/');
        const track = this.track(session.id, cwd);
        const position = positionForCall(session, callId);
        const fallback = sessionTurnPosition(session);
        const observed = statIdentity(abs);
        const call = {
            callId,
            toolName,
            path: relPath,
            turn: position?.turn ?? fallback?.turn ?? 0,
            step: position?.step ?? fallback?.step ?? 0,
            seq: position?.seq ?? fallback?.seq ?? -1,
            timestamp: Date.now(),
            ...(observed === undefined ? { deleted: true } : { identity: observed.key }),
        };
        track.calls.push(call);
        this.trim(track);
        const kind = observation.kind;
        track.queue = track.queue.then(async () => {
            if (kind === 'absent')
                return;
            // The file may have been rewritten by a later call while this call waited
            // for the object store: the intermediate content is gone, so record
            // nothing rather than attributing the newer content to this call.
            const current = statIdentity(abs);
            if (current === undefined) {
                call.superseded = true;
                delete call.deleted;
                return;
            }
            if (observed !== undefined && current.key !== observed.key) {
                call.superseded = true;
                return;
            }
            if (current.size > this.options.maxBlobBytes) {
                call.oversized = true;
                return;
            }
            const provider = this.snapshots.providerFor(cwd, session.id);
            const blob = await provider.writeBlob(abs).catch(() => undefined);
            if (blob === undefined)
                call.deleted = true;
            else
                call.blob = blob;
        }).catch(() => undefined);
    }
    /** Wait for every queued hash of one session (used before asserting on blobs). */
    async settle(sessionId) {
        await this.tracks.get(sessionId)?.queue.catch(() => undefined);
    }
    /**
     * Ensure the session's chain base exists, capturing the full worktree once.
     * Called at turn start (before any tool call) and lazily as a fallback. When
     * calls were already recorded the base is post-write and `baseDegraded` is
     * set: the first call on each path then has no caller-level baseline.
     */
    async ensureBase(sessionId, cwd) {
        const track = this.track(sessionId, cwd);
        if (track.base !== undefined && track.head !== undefined)
            return track.head;
        const provider = this.snapshots.providerFor(cwd, sessionId);
        if (!(await provider.available().catch(() => false)))
            return undefined;
        return this.createBase(track, provider);
    }
    /** True when the chain base was captured after calls were already recorded. */
    baseDegraded(sessionId) {
        return this.tracks.get(sessionId)?.baseDegraded === true;
    }
    /**
     * Freeze every pending call into `refs/dsh/head` with one fast-import. Returns
     * the chain head commit, or undefined when git is unavailable.
     */
    async flush(sessionId) {
        const track = this.tracks.get(sessionId);
        if (track === undefined)
            return undefined;
        await track.queue.catch(() => undefined);
        const pending = track.calls.filter(call => call.commit === undefined);
        if (pending.length === 0)
            return track.head;
        const provider = this.snapshots.providerFor(track.cwd, track.sessionId);
        if (!(await provider.available().catch(() => false)))
            return track.head;
        const base = track.head ?? track.base ?? await this.createBase(track, provider);
        if (base === undefined)
            return undefined;
        // Only calls with a resolved blob (or a deletion) become commits; oversized
        // writes keep their call identity in memory but stay turn-level in git.
        const committed = pending.filter(call => call.blob !== undefined || call.deleted === true);
        if (committed.length === 0)
            return base;
        const lines = [];
        let parent = base;
        committed.forEach((call, index) => {
            const message = encodeMessage(call);
            const length = Buffer.byteLength(message, 'utf8');
            lines.push('commit refs/dsh/head');
            lines.push(`mark :${index + 1}`);
            lines.push(`committer dsh <dsh@local> ${Math.floor(call.timestamp / 1000)} +0000`);
            lines.push(`data ${length}`);
            lines.push(message);
            lines.push(`from ${parent}`);
            lines.push(call.deleted === true || call.blob === undefined
                ? `D ${call.path}`
                : `M 100644 ${call.blob} ${call.path}`);
            lines.push('');
            parent = `:${index + 1}`;
        });
        await provider.fastImport(lines.join('\n'));
        const head = await provider.readRef(CHAIN_HEAD_REF);
        if (head === undefined)
            return base;
        const list = await provider.run(['rev-list', '--reverse', `${base}..${head}`]);
        const commits = list.code === 0 ? list.stdout.split('\n').filter(Boolean) : [];
        committed.forEach((call, index) => {
            const commit = commits[index];
            if (commit !== undefined)
                call.commit = commit;
        });
        // `track.base` is the immutable chain root; only `head` moves.
        track.head = head;
        return head;
    }
    /** Freeze every session with pending calls (turn end / shutdown best-effort). */
    async flushAll() {
        for (const sessionId of [...this.tracks.keys()]) {
            await this.flush(sessionId).catch(() => undefined);
        }
    }
    /** Calls of the current process, oldest first (frozen entries carry `commit`). */
    calls(sessionId) {
        return this.tracks.get(sessionId)?.calls ?? [];
    }
    /** Session base commit (the chain's first parent), when known. */
    base(sessionId) {
        return this.tracks.get(sessionId)?.base;
    }
    /**
     * The session's list base (`refs/dsh/base`), which is the chain *root* no
     * matter how the in-memory anchor was set. Chains created before the ref
     * existed are backfilled once from the parentless root of `refs/dsh/head`.
     * Returns undefined when the session has no chain at all.
     */
    async readBase(cwd, sessionId) {
        const provider = this.snapshots.providerFor(cwd, sessionId);
        if (!(await provider.available().catch(() => false)))
            return this.tracks.get(sessionId)?.base;
        const stored = await provider.readRef(CHAIN_BASE_REF);
        if (stored !== undefined)
            return stored;
        const head = (await provider.readRef(CHAIN_HEAD_REF)) ?? this.tracks.get(sessionId)?.head;
        if (head === undefined)
            return this.tracks.get(sessionId)?.base;
        const roots = await provider.roots(head).catch(() => []);
        const root = roots[roots.length - 1];
        if (root === undefined)
            return undefined;
        await provider.updateRef(CHAIN_BASE_REF, root).catch(() => false);
        return root;
    }
    head(sessionId) {
        return this.tracks.get(sessionId)?.head;
    }
    /** Paths touched by this session's calls (hashed form, forward slashes). */
    pathsForSession(sessionId) {
        return new Set(this.calls(sessionId).map(call => call.path));
    }
    /** Paths seen but not captured because they exceeded `maxBlobBytes`. */
    oversizedPaths(sessionId) {
        return new Set(this.calls(sessionId).filter(call => call.oversized === true).map(call => call.path));
    }
    /**
     * Cold read: rebuild the call list from the commit chain, so patch identity
     * survives a process restart for everything already frozen (unfrozen calls
     * are intentionally lost — docs/git-only-plan.md §4.4).
     */
    async loadCalls(cwd, sessionId) {
        const live = this.tracks.get(sessionId);
        if (live !== undefined) {
            const pendingMissing = live.calls.some(call => call.commit === undefined);
            if (!pendingMissing && live.calls.length > 0)
                return live.calls;
        }
        const provider = this.snapshots.providerFor(cwd, sessionId);
        if (!(await provider.available().catch(() => false)))
            return live?.calls ?? [];
        const log = await provider.run(['log', '--format=%H%x00%ct%x00%B%x1e', CHAIN_HEAD_REF]);
        if (log.code !== 0)
            return live?.calls ?? [];
        const calls = [];
        for (const record of log.stdout.split('\x1e')) {
            const parts = record.split('\x00');
            if (parts.length < 3)
                continue;
            const commit = (parts[0] ?? '').trim();
            const timestamp = Number(parts[1] ?? '0') * 1000;
            const call = decodeMessage(commit, parts[2] ?? '');
            if (call === undefined)
                continue;
            call.timestamp = timestamp;
            calls.push(call);
        }
        calls.reverse();
        if (live !== undefined && calls.length > 0) {
            for (const call of live.calls) {
                if (call.commit !== undefined && !calls.some(item => item.callId === call.callId))
                    calls.push(call);
            }
        }
        return calls;
    }
    /** Forget in-memory state (session close / tests). */
    reset(sessionId) {
        if (sessionId === undefined)
            this.tracks.clear();
        else
            this.tracks.delete(sessionId);
    }
    track(sessionId, cwd) {
        const existing = this.tracks.get(sessionId);
        if (existing !== undefined && path.resolve(existing.cwd) === path.resolve(cwd))
            return existing;
        const created = {
            sessionId,
            cwd,
            calls: [],
            queue: Promise.resolve(),
        };
        this.tracks.set(sessionId, created);
        return created;
    }
    /** Session base commit: a full worktree capture, committed once per session. */
    async createBase(track, provider) {
        const existing = await provider.readRef(CHAIN_HEAD_REF);
        if (existing !== undefined) {
            // The chain already exists (typically from an earlier process). Appending
            // must continue from its tip, but the session's *list* base stays the
            // persisted root, so backfill `refs/dsh/base` when it is missing.
            track.base = existing;
            track.head = existing;
            const stored = await provider.readRef(CHAIN_BASE_REF);
            if (stored === undefined) {
                const roots = await provider.roots(existing).catch(() => []);
                const root = roots[roots.length - 1];
                if (root !== undefined)
                    await provider.updateRef(CHAIN_BASE_REF, root).catch(() => false);
            }
            return existing;
        }
        if (track.calls.length > 0)
            track.baseDegraded = true;
        const tree = await provider.captureTree().catch(() => undefined);
        if (tree === undefined)
            return undefined;
        const commit = await provider.commitTree(tree, [], `dsh base\nsession=${track.sessionId}\n`);
        await provider.updateRef(CHAIN_HEAD_REF, commit);
        await provider.updateRef(CHAIN_BASE_REF, commit).catch(() => false);
        track.base = commit;
        track.head = commit;
        return commit;
    }
    trim(track) {
        const overflow = track.calls.length - this.maxCalls;
        if (overflow > 0)
            track.calls.splice(0, overflow);
    }
}
/**
 * Cheap synchronous identity of a file, captured when the observation arrives.
 * Re-checked before hashing so a call whose content was already replaced by a
 * later call is dropped instead of mis-attributed.
 */
function statIdentity(abs) {
    try {
        const stat = fs.statSync(abs);
        if (!stat.isFile())
            return undefined;
        return { key: `${stat.size}:${stat.mtimeMs}:${stat.ino}`, size: stat.size };
    }
    catch {
        return undefined;
    }
}
/** The session-log position of a tool call (turn/step/seq). */
function positionForCall(session, callId) {
    const events = session.snapshotEvents();
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event === undefined || event.type !== 'tool/call')
            continue;
        const data = event.data;
        if (data.callId !== callId)
            continue;
        return { turn: data.turn ?? 0, step: data.step ?? 0, seq: event.seq };
    }
    return undefined;
}
/** Fallback coordinates: the session's currently open turn/step. */
function sessionTurnPosition(session) {
    let turn = 0;
    let step = 0;
    let seq = -1;
    for (const event of session.snapshotEvents()) {
        seq = event.seq;
        if (event.type === 'turn/start')
            turn = event.data.turn;
        if (event.type === 'step/start')
            step = event.data.step;
    }
    return turn > 0 ? { turn, step, seq } : undefined;
}
