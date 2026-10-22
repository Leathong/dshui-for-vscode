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
 * comparison. Per-call patches come from the tracked commit chain and only
 * annotate rows; the list itself is the whole worktree diff, not an
 * attribution-filtered subset. Everything the previous implementation needed —
 * fingerprints, accept-time content snapshots, cross-session activity windows
 * and borrowed object stores — is gone.
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
    /** Last effective baseline tree per session, keyed by chain base + pre-image paths. */
    private readonly baselineTrees;
    /**
     * In-flight boundary captures are tracked inside SnapshotManager's per-session
     * capture queue; the list awaits `waitForCaptures()` before reading a
     * boundary so it never uses a tree whose capture is still running.
     */
    constructor(ctx: RollbackCordisContext, snapshots: SnapshotManager, tracker: CallTracker, accepts: AcceptBase, safety: RollbackSafety, options: SessionChangesOptions);
    /**
     * Record the turn-end boundary when a turn finishes. The capture runs after
     * `turn/end` is appended, so it contains everything the turn produced;
     * changes made afterwards are excluded while the session stays idle. The
     * O(worktree) capture is skipped when the session never created a snapshot
     * repository (nothing could be listed anyway). Subagent sessions fold into
     * their main session.
     */
    noteTurnEnd(session: Session, turn: number): Promise<unknown> | undefined;
    /**
     * Record the gap between the previous turn's end and this turn's start.
     *
     * Only a transition whose previous event is a completed `turn/end` (after
     * skipping restore markers) is safe: for an aborted/mid-turn close the
     * previous boundary would include that turn's work as "gap". A fork seed
     * marker is also rejected (its parent boundary is not this session's turn).
     */
    noteTurnStart(session: Session, turn: number, startTree: string): Promise<unknown> | undefined;
    /**
     * Record the session's end boundary when it is disposed (closed, or the
     * host shuts down). This is the fallback for a close that happened inside a
     * turn, where no turn-end capture covers the final state. Sessions that
     * never wrote through the tracked chain and never accepted anything have no
     * modification list to protect, so the O(worktree) capture is skipped.
     */
    noteSessionEnd(session: Session): Promise<unknown> | undefined;
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
    /**
     * The chain-base tree with the session-start contents of paths the base
     * capture could never see (ignored files, excluded nested paths) added on
     * top. This is the baseline both the accepted seed and the "already
     * accepted" group compare against.
     *
     * A path that would fall under a gitlink in the base tree cannot also be a
     * file (a non-materialized nested repo): those stay on the whole-file
     * behaviour and are reported once as a warning.
     */
    private baselineWithPreImages;
    /** A list with nothing to show (no chain, no accept baseline yet). */
    private emptyValue;
    /**
     * Drop foreign rows whose current content was last changed outside a turn.
     *
     * `refs/dsh/gap` holds the cumulative content of paths whose last gap change
     * produced a file; `refs/dsh/gap-deleted` holds paths whose last gap change
     * removed one. Ownership is checked first, so a path a turn wrote again (even
     * back to the old gap content) is never dropped here. Paths absent from both
     * trees were not observed in a gap and stay listed.
     */
    private dropGapChanges;
    /**
     * Drop foreign rows written after the current idle boundary (a completed
     * turn, or a session-end fallback when the close happened inside a turn).
     *
     * The primary boundary is the tree captured at that boundary: a row present
     * there whose current blob differs (including a deletion) was modified after
     * the turn/session ended. A row absent from the tree is ambiguous — `add -A`
     * skips ignored and excluded paths, so it may have existed at the boundary
     * without being recorded — and only the file mtime can prove it appeared
     * later.
     *
     * When no boundary tree exists, the file mtime against the boundary event is
     * the fallback for every candidate; a deleted file has no mtime and stays
     * listed in that case.
     *
     * Only rows already proven foreign are candidates: a path whose content still
     * matches this session's newest tracked post-image stays listed either way.
     * The hidden paths are removed from `changes`; the caller keeps them out of
     * the accepted group so the same path cannot reappear there.
     */
    private dropAfterBoundaryChanges;
    /**
     * Accepted rows: paths whose accepted content differs from the session
     * baseline, i.e. what this session accepted. One diff process; hunks are
     * intentionally omitted (the accepted group is a file list).
     *
     * Suppression is purely path-based: a path that is still pending (it differs
     * from the accepted baseline, so it is already in the unaccepted list) never
     * appears twice. No authorship is inferred — the tracked chain is not
     * authoritative, and guessing wrong would either hide a row or duplicate it.
     */
    private acceptedRows;
    private nestedRoots;
    /**
     * Per-call patches of the session chain, with hunks and accept state. A
     * patch is accepted when its post-image blob equals the accepted blob of the
     * same path. The chain only annotates rows; it never scopes the list.
     *
     * The first call on an ignored path has a parent tree that lacks the file
     * (`add -A` skipped it), so its chain patch is a whole-file "added" patch.
     * When the session-start blob is known the patch is recomputed from the
     * baseline tree, which turns it back into the actual modification.
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
    /**
     * The patch between the session baseline and one call, restricted to its
     * path. Used when the call's chain parent lacks the file (an ignored path):
     * the chain patch would add the whole file while the baseline already holds
     * its session-start content.
     */
    private baselinePatch;
    private callPatch;
    /** Raw `diff` output for a baseline-to-call patch (kept as text for replay). */
    private renderPatch;
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
/** Short, bounded path list for a warning message. */
export declare function summarize(paths: readonly string[], max?: number): string;
/** Attach per-path tool-call patch lists to the file rows. */
export declare function attachToolCalls(changes: RollbackFileChange[], modifications: readonly RollbackModification[]): void;
/** The turn the session started at (first `turn/start`). */
export declare function sessionStartTurn(session: Session): number;
/**
 * The boundary event when the session is idle at a completed turn (including a
 * restored session reopened at its tail), or `undefined` while a turn is
 * running.
 *
 * A trailing `turn/end` marks a completed turn. Untagged trailing
 * `session/end-seed` markers identify a restore; the event before the last one
 * is the last event of the ended lifecycle. A fork's tagged inherited marker
 * is not a boundary and leaves the session active. Once the reopened session
 * appends a new event, the trailing marker disappears and normal (unfiltered)
 * listing resumes; the next completed turn creates a new boundary.
 */
export interface SessionIdleEnd {
    /** Epoch milliseconds of the boundary event (`turn/end` or last event). */
    endedAt: number;
    /** True when the boundary is a completed turn, false for a mid-turn close. */
    turnEnded: boolean;
}
export declare function sessionIdleEnd(session: Session): SessionIdleEnd | undefined;
