import type { RollbackAcceptAllRequest, RollbackAcceptFileRequest, RollbackAcceptModificationRequest, RollbackAcceptFingerprint, RollbackAcceptResult, RollbackSessionChangesResult, RollbackUndoAllRequest, RollbackUndoAllResult, RollbackUndoFileRequest, RollbackUndoFileResult, RollbackUndoModificationRequest, RollbackUndoModificationResult } from '../shared/types.ts';
import type { RollbackCordisContext } from './context.ts';
import { AcceptLedger } from './accepts.ts';
import { ChangeLedger } from './ledger.ts';
import { RollbackSafety } from './safety.ts';
import { SnapshotManager } from './snapshot.ts';
export interface SessionChangesOptions {
    spawnTimeoutMs: number;
    maxDiffHunksPerFile: number;
    maxDiffBytesPerFile: number;
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
    sessionChanges(sessionId: string): Promise<RollbackSessionChangesResult>;
    acceptFile(request: RollbackAcceptFileRequest): Promise<RollbackAcceptResult>;
    acceptModification(request: RollbackAcceptModificationRequest): Promise<RollbackAcceptResult>;
    undoFile(request: RollbackUndoFileRequest): Promise<RollbackUndoFileResult>;
    undoModification(request: RollbackUndoModificationRequest): Promise<RollbackUndoModificationResult>;
    private liveSession;
    /** Accept every unaccepted file of the bound list (with patch cascades). */
    acceptAll(request: RollbackAcceptAllRequest): Promise<RollbackAcceptResult>;
    /** Undo every unaccepted file of the bound list back to the session baseline. */
    undoAll(request: RollbackUndoAllRequest): Promise<RollbackUndoAllResult>;
    private attachToolCalls;
    /** Every write/edit patch id (ledger + session-log only) attributed to a path. */
    private patchIdsForPath;
    private mutationFailure;
}
/** Content fingerprint of a file; falls back to stat identity for unreadable files. */
export declare function fingerprintOfAbs(abs: string): Promise<RollbackAcceptFingerprint | undefined>;
