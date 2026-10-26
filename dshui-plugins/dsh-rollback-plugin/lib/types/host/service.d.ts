import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { OpenAtResult, RollbackAcceptAllRequest, RollbackAcceptAllResult, RollbackAcceptFileRequest, RollbackAcceptModificationRequest, RollbackAcceptResult, RollbackExecuteRequest, RollbackExecuteResult, RollbackPrepareResult, RollbackPrepareTurnResult, RollbackSessionChangesResult, RollbackStatusResult, RollbackUndoAllRequest, RollbackUndoAllResult, RollbackUndoFileRequest, RollbackUndoFileResult, RollbackUndoHunksRequest, RollbackUndoHunksResult, RollbackUndoModificationRequest, RollbackUndoModificationResult } from '../shared/types.ts';
import type { RollbackCordisContext } from './context.ts';
import { AcceptBase } from './accept-base.ts';
import { RollbackRestore } from './restore.ts';
import { RollbackSafety } from './safety.ts';
import { SessionChangeManager } from './session-changes.ts';
import { SnapshotManager } from './snapshot.ts';
import { CallTracker } from './tracking.ts';
export interface RollbackHostConfig {
    enabled: boolean;
    snapshotOnPreStep: boolean;
    maxSnapshotsPerSession: number;
    maxDiffHunksPerFile: number;
    maxDiffBytesPerFile: number;
    restoreChunkSize: number;
    guardRetentionMs: number;
    lockStaleMs: number;
    spawnTimeoutMs: number;
    /** Turn-level capture of per-call tracked writes (git-native model). */
    trackingEnabled: boolean;
    /** Per-call blob capture ceiling; larger writes stay turn-level only. */
    maxBlobBytes: number;
    /** In-memory per-call history retained per session. */
    maxTrackedCallsPerSession: number;
    /** Diff context lines used for hunk views and hunk undo. */
    diffContextLines: number;
}
export declare const DEFAULT_ROLLBACK_CONFIG: RollbackHostConfig;
export declare class RollbackService extends TypertRemoteService {
    readonly host: RollbackCordisContext;
    readonly config: RollbackHostConfig;
    readonly snapshots: SnapshotManager;
    readonly safety: RollbackSafety;
    readonly acceptBase: AcceptBase;
    readonly restore: RollbackRestore;
    readonly sessionChangeManager: SessionChangeManager;
    readonly tracker: CallTracker;
    constructor(ctx: Context, config?: Partial<RollbackHostConfig>);
    prepare(sessionId: string, messageId: string, _signal?: AbortSignal): Promise<RollbackPrepareResult>;
    execute(request: RollbackExecuteRequest, _signal?: AbortSignal): Promise<RollbackExecuteResult>;
    openAt(sessionId: string, path: string, line?: number, _signal?: AbortSignal): Promise<OpenAtResult>;
    status(sessionId: string, _signal?: AbortSignal): Promise<RollbackStatusResult>;
    prepareTurn(sessionId: string, turn: number, _signal?: AbortSignal): Promise<RollbackPrepareTurnResult>;
    sessionChanges(sessionId: string, _signal?: AbortSignal): Promise<RollbackSessionChangesResult>;
    /**
     * Explicit refresh: capture the worktree first when a turn is running, so
     * bash-created files show up now instead of at the next turn boundary.
     */
    refreshChanges(sessionId: string, _signal?: AbortSignal): Promise<RollbackSessionChangesResult>;
    acceptAll(request: RollbackAcceptAllRequest, _signal?: AbortSignal): Promise<RollbackAcceptAllResult>;
    acceptFile(request: RollbackAcceptFileRequest, _signal?: AbortSignal): Promise<RollbackAcceptResult>;
    acceptModification(request: RollbackAcceptModificationRequest, _signal?: AbortSignal): Promise<RollbackAcceptResult>;
    undoAll(request: RollbackUndoAllRequest, _signal?: AbortSignal): Promise<RollbackUndoAllResult>;
    undoFile(request: RollbackUndoFileRequest, _signal?: AbortSignal): Promise<RollbackUndoFileResult>;
    undoModification(request: RollbackUndoModificationRequest, _signal?: AbortSignal): Promise<RollbackUndoModificationResult>;
    undoHunks(request: RollbackUndoHunksRequest, _signal?: AbortSignal): Promise<RollbackUndoHunksResult>;
}
