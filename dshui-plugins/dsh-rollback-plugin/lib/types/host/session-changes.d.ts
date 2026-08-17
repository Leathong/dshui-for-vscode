import type { RollbackAcceptAllRequest, RollbackAcceptFileRequest, RollbackAcceptModificationRequest, RollbackAcceptFingerprint, RollbackAcceptResult, RollbackSessionChangesResult, RollbackUndoAllRequest, RollbackUndoAllResult, RollbackUndoFileRequest, RollbackUndoFileResult, RollbackUndoModificationRequest, RollbackUndoModificationResult } from '../shared/types.ts';
import type { RollbackCordisContext, Session } from './context.ts';
import { AcceptLedger } from './accepts.ts';
import { ChangeLedger } from './ledger.ts';
import { RollbackSafety } from './safety.ts';
import { SnapshotManager } from './snapshot.ts';
export interface SessionChangesOptions {
    spawnTimeoutMs: number;
    maxDiffHunksPerFile: number;
    maxDiffBytesPerFile: number;
    /** Bound (bytes) on accept-time content snapshots used as later diff baselines. */
    acceptContentMaxBytes?: number;
}
/**
 * The session modification list: a live, session-wide diff against the
 * earliest session snapshot merged with ledger-covered tool changes, plus
 * accept markers and per-file / per-patch undo mutations.
 */
export declare class SessionChangeManager {
    private readonly ctx;
    private readonly snapshots;
    private readonly ledger;
    private readonly safety;
    private readonly accepts;
    private readonly options;
    private readonly bound;
    constructor(ctx: RollbackCordisContext, snapshots: SnapshotManager, ledger: ChangeLedger, safety: RollbackSafety, accepts: AcceptLedger, options: SessionChangesOptions);
    /** Bound (bytes) on accept-time content snapshots kept as later diff baselines. */
    private get acceptContentMaxBytes();
    sessionChanges(sessionId: string): Promise<RollbackSessionChangesResult>;
    acceptFile(request: RollbackAcceptFileRequest): Promise<RollbackAcceptResult>;
    acceptModification(request: RollbackAcceptModificationRequest): Promise<RollbackAcceptResult>;
    undoFile(request: RollbackUndoFileRequest): Promise<RollbackUndoFileResult>;
    undoModification(request: RollbackUndoModificationRequest): Promise<RollbackUndoModificationResult>;
    /**
     * Paths that changed during this session's own activity windows. Every
     * snapshot this session captured opens a window that closes at the next
     * snapshot captured by any session in the same workspace (treeless
     * manifests extend the window); the last window ends at the current
     * worktree. Changes outside these windows belong to other sessions and
     * must not appear in this session's list. Returns undefined when window
     * attribution is impossible (no own snapshot in the workspace timeline,
     * or snapshot objects were garbage collected) — partial attribution
     * would hide the session's own changes, which is worse than showing
     * foreign ones.
     */
    private ownWindowPaths;
    private liveSession;
    /** Accept every unaccepted file of the bound list (with patch cascades). */
    acceptAll(request: RollbackAcceptAllRequest): Promise<RollbackAcceptResult>;
    /** Undo every unaccepted file of the bound list back to the session baseline. */
    undoAll(request: RollbackUndoAllRequest): Promise<RollbackUndoAllResult>;
    private attachToolCalls;
    /** Every write/edit patch id (ledger + session-log only) attributed to a path. */
    private patchIdsForPath;
    /**
     * Re-diff a previously accepted file against the accepted content, so a
     * second round of changes shows only what happened after acceptance instead
     * of the whole session diff against the earliest snapshot. Falls back to
     * the original hunks (git / ledger baseline) when the current file is
     * missing, binary, oversized, or unreadable.
     */
    private rebaseHunksOnAccepted;
    private mutationFailure;
}
/**
 * The session's real starting turn: the first `turn/start` this session
 * produced itself. Plain new sessions start at turn 1; forked/resumed
 * sessions inherit seed events (which keep their original seq numbers), so
 * their real start is the first turn/start at or after the seed boundary.
 */
export declare function sessionStartTurn(session: Session): number;
/** Content fingerprint of a file; falls back to stat identity for unreadable files. */
export declare function fingerprintOfAbs(abs: string): Promise<RollbackAcceptFingerprint | undefined>;
/**
 * Accept-marker data for a file: the content fingerprint (whole file, so
 * later state changes are detected) plus the bounded text content kept as
 * the diff baseline once the file changes again. Binary or oversized files
 * keep only the fingerprint.
 */
export declare function acceptSnapshotOf(abs: string, maxBytes: number): Promise<{
    fingerprint: RollbackAcceptFingerprint | undefined;
    content?: string;
}>;
