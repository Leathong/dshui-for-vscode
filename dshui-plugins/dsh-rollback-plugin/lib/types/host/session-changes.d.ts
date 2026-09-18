import type { RollbackAcceptAllRequest, RollbackAcceptFileRequest, RollbackAcceptModificationRequest, RollbackAcceptResult, RollbackFileChange, RollbackModification, RollbackSessionChangesResult, RollbackUndoAllRequest, RollbackUndoAllResult, RollbackUndoFileRequest, RollbackUndoFileResult, RollbackUndoHunksRequest, RollbackUndoHunksResult, RollbackUndoModificationRequest, RollbackUndoModificationResult } from '../shared/types.ts';
import type { RollbackCordisContext, Session } from './context.ts';
import type { AcceptBase } from './accept-base.ts';
import type { RollbackSafety } from './safety.ts';
import type { SnapshotManager } from './snapshot.ts';
import type { CallTracker } from './tracking.ts';
/**
 * The session modification list, derived entirely from git
 * (docs/git-only-plan.md §3).
 *
 * The baseline is `refs/dsh/accepted`, so "what changed" is one
 * `git diff accepted` against the worktree and "is it accepted" is a blob
 * comparison. Per-call patches come from the tracked commit chain. Everything
 * the previous implementation needed — fingerprints, accept-time content
 * snapshots, cross-session activity windows and borrowed object stores — is
 * gone.
 */
export interface SessionChangesOptions {
    spawnTimeoutMs: number;
    maxDiffHunksPerFile: number;
    maxDiffBytesPerFile: number;
    /** Diff context used for hunk enumeration and hunk undo (must match). */
    diffContextLines: number;
}
export declare class SessionChangeManager {
    private readonly ctx;
    private readonly snapshots;
    private readonly tracker;
    private readonly accepts;
    private readonly safety;
    private readonly options;
    private readonly bound;
    constructor(ctx: RollbackCordisContext, snapshots: SnapshotManager, tracker: CallTracker, accepts: AcceptBase, safety: RollbackSafety, options: SessionChangesOptions);
    sessionChanges(sessionId: string): Promise<RollbackSessionChangesResult>;
    acceptFile(request: RollbackAcceptFileRequest): Promise<RollbackAcceptResult>;
    acceptModification(request: RollbackAcceptModificationRequest): Promise<RollbackAcceptResult>;
    acceptAll(request: RollbackAcceptAllRequest): Promise<RollbackAcceptResult>;
    undoFile(request: RollbackUndoFileRequest): Promise<RollbackUndoFileResult>;
    undoModification(request: RollbackUndoModificationRequest): Promise<RollbackUndoModificationResult>;
    undoHunks(request: RollbackUndoHunksRequest): Promise<RollbackUndoHunksResult>;
    undoAll(request: RollbackUndoAllRequest): Promise<RollbackUndoAllResult>;
    /**
     * Shared undo skeleton: verify the listed worktree state is unchanged, take
     * the workspace lock, fence, flush the session, guard the affected paths, run
     * the mutation, journal it, and auto-accept the result.
     */
    private withUndo;
    private requireBound;
    private liveSession;
    /**
     * Turn-start tree of this session, used to seed the accepted baseline. Read
     * from the persisted `refs/dsh/base` rather than the in-memory anchor: after
     * a host restart that anchor is gone or has been re-pointed at the chain tip,
     * which would silently drop every already-accepted file from the list.
     */
    private seedTree;
    /** A list with nothing to show (no chain, no accept baseline yet). */
    private emptyValue;
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
    private acceptedRows;
    private nestedRoots;
    /**
     * Per-call patches of the session chain, with hunks and accept state. Also
     * reports, per path, the post-image blob of the *newest* call and whether that
     * call has a usable post-image — the caller uses it to attribute the worktree
     * content to this session (or to somebody else).
     */
    private modifications;
    private locatePatch;
    /**
     * Post-image blob of every call, keyed by `callId`. Blobs already in memory
     * (the common case) are used as-is; the rest — a cold read after a restart
     * leaves `TrackedCall.blob` unset — are resolved in one
     * `cat-file --batch-check` instead of one `rev-parse` per call.
     */
    private callBlobs;
    private callPatch;
    /**
     * Accepted blob of many paths in one process. `AcceptBase.acceptedBlob`
     * resolves the ref and spawns per path; the accept paths ask for every
     * changed file at once. `known` entries (from the accept that just ran) are
     * reused as-is, and only the paths it did not cover are resolved.
     */
    private acceptedBlobMap;
    private acceptValue;
    /**
     * Patch ids whose post-image already equals the accepted content. Pass
     * `acceptedBlobs` (from the accept that just ran) to skip resolving the
     * accepted tree again.
     */
    private acceptedPatchIds;
}
/** Attach per-path tool-call patch lists to the file rows. */
export declare function attachToolCalls(changes: RollbackFileChange[], modifications: readonly RollbackModification[]): void;
/** The turn the session started at (first `turn/start`). */
export declare function sessionStartTurn(session: Session): number;
