import type { FsObservation, FsTarget, RollbackCordisContext, RollbackToolActor } from './context.ts';
import type { SnapshotManager } from './snapshot.ts';
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
export declare const CHAIN_HEAD_REF = "refs/dsh/head";
/**
 * The session's *list* base: the tree captured at its first turn start. Unlike
 * `head` this ref never moves, so the accepted-file list can be diffed against
 * it after a host restart, when the in-memory anchor (`track.base`) is either
 * gone or has been re-pointed at the chain tip.
 */
export declare const CHAIN_BASE_REF = "refs/dsh/base";
/** A tool call whose path changed. `blob` is the content *after* the call. */
export interface TrackedCall {
    callId: string;
    toolName: string;
    /** Workspace-relative path with forward slashes. */
    path: string;
    turn: number;
    step: number;
    seq: number;
    timestamp: number;
    /** Blob after the call; undefined with `deleted` means the call removed it. */
    blob?: string;
    deleted?: boolean;
    /** The write exceeded `maxBlobBytes`, so no caller-level patch exists. */
    oversized?: boolean;
    /**
     * The path was rewritten by a later call before this call's content could be
     * hashed, so no intermediate state exists to record. The later call carries
     * the change.
     */
    superseded?: boolean;
    /** Calls folded into this entry (same path, recorded before the hash settled). */
    mergedCallIds?: string[];
    /** Commit implementing this call; set once the chain is frozen. */
    commit?: string;
    /** Stat identity captured synchronously at observation time (race guard). */
    identity?: string;
}
export interface CallTrackerOptions {
    /** Per-call ceiling for blob capture. Larger writes stay turn-level only. */
    maxBlobBytes: number;
    /** In-memory call history retained per session. */
    maxCallsPerSession?: number;
    dshHome?: string;
}
export declare class CallTracker {
    private readonly ctx;
    private readonly snapshots;
    private readonly options;
    private readonly tracks;
    private readonly maxCalls;
    constructor(ctx: RollbackCordisContext, snapshots: SnapshotManager, options: CallTrackerOptions);
    /**
     * Record one observed write/edit. Synchronous by contract (`fs/observed` is a
     * synchronous event); the blob write runs on the session's serial queue.
     *
     * Paths inside a nested git repository are tracked like any other: the call is
     * captured from the file's bytes, so the embedded worktree never has to be
     * indexed (the list path stages those paths from their blob).
     */
    observe(target: FsTarget, observation: FsObservation, actor: RollbackToolActor | undefined): void;
    /** Wait for every queued hash of one session (used before asserting on blobs). */
    settle(sessionId: string): Promise<void>;
    /**
     * Ensure the session's chain base exists, capturing the full worktree once.
     * Called at turn start (before any tool call) and lazily as a fallback. When
     * calls were already recorded the base is post-write and `baseDegraded` is
     * set: the first call on each path then has no caller-level baseline.
     */
    ensureBase(sessionId: string, cwd: string): Promise<string | undefined>;
    /** True when the chain base was captured after calls were already recorded. */
    baseDegraded(sessionId: string): boolean;
    /**
     * Freeze every pending call into `refs/dsh/head` with one fast-import. Returns
     * the chain head commit, or undefined when git is unavailable.
     */
    flush(sessionId: string): Promise<string | undefined>;
    /** Freeze every session with pending calls (turn end / shutdown best-effort). */
    flushAll(): Promise<void>;
    /** Calls of the current process, oldest first (frozen entries carry `commit`). */
    calls(sessionId: string): TrackedCall[];
    /** Session base commit (the chain's first parent), when known. */
    base(sessionId: string): string | undefined;
    /**
     * The session's list base (`refs/dsh/base`), which is the chain *root* no
     * matter how the in-memory anchor was set. Chains created before the ref
     * existed are backfilled once from the parentless root of `refs/dsh/head`.
     * Returns undefined when the session has no chain at all.
     */
    readBase(cwd: string, sessionId: string): Promise<string | undefined>;
    head(sessionId: string): string | undefined;
    /** Paths touched by this session's calls (hashed form, forward slashes). */
    pathsForSession(sessionId: string): Set<string>;
    /** Paths seen but not captured because they exceeded `maxBlobBytes`. */
    oversizedPaths(sessionId: string): Set<string>;
    /**
     * Cold read: rebuild the call list from the commit chain, so patch identity
     * survives a process restart for everything already frozen (unfrozen calls
     * are intentionally lost — docs/git-only-plan.md §4.4).
     */
    loadCalls(cwd: string, sessionId: string): Promise<TrackedCall[]>;
    /** Forget in-memory state (session close / tests). */
    reset(sessionId?: string): void;
    private track;
    /** Session base commit: a full worktree capture, committed once per session. */
    private createBase;
    private trim;
}
