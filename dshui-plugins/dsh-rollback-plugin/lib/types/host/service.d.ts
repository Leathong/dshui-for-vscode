import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { OpenAtResult, RollbackAcceptAllRequest, RollbackAcceptAllResult, RollbackAcceptFileRequest, RollbackAcceptModificationRequest, RollbackAcceptResult, RollbackExecuteRequest, RollbackExecuteResult, RollbackPrepareResult, RollbackPrepareTurnResult, RollbackSessionChangesResult, RollbackStatusResult, RollbackUndoAllRequest, RollbackUndoAllResult, RollbackUndoFileRequest, RollbackUndoFileResult, RollbackUndoModificationRequest, RollbackUndoModificationResult } from '../shared/types.ts';
import type { RollbackCordisContext } from './context.ts';
import { AcceptLedger } from './accepts.ts';
import { ChangeLedger } from './ledger.ts';
import { RollbackRestore } from './restore.ts';
import { RollbackSafety } from './safety.ts';
import { SessionChangeManager } from './session-changes.ts';
import { SnapshotManager } from './snapshot.ts';
export interface RollbackHostConfig {
    enabled: boolean;
    snapshotOnPreStep: boolean;
    ledgerMaxTextBytes: number;
    maxLedgerRecordsPerSession: number;
    maxSnapshotsPerSession: number;
    maxDiffHunksPerFile: number;
    maxDiffBytesPerFile: number;
    restoreChunkSize: number;
    guardRetentionMs: number;
    lockStaleMs: number;
    spawnTimeoutMs: number;
}
export declare const DEFAULT_ROLLBACK_CONFIG: RollbackHostConfig;
export declare class RollbackService extends TypertRemoteService {
    readonly host: RollbackCordisContext;
    readonly config: RollbackHostConfig;
    readonly snapshots: SnapshotManager;
    readonly ledger: ChangeLedger;
    readonly safety: RollbackSafety;
    readonly accepts: AcceptLedger;
    readonly restore: RollbackRestore;
    readonly sessionChangeManager: SessionChangeManager;
    constructor(ctx: Context, config?: Partial<RollbackHostConfig>);
    prepare(sessionId: string, messageId: string, _signal?: AbortSignal): Promise<RollbackPrepareResult>;
    execute(request: RollbackExecuteRequest, _signal?: AbortSignal): Promise<RollbackExecuteResult>;
    openAt(sessionId: string, path: string, line?: number, _signal?: AbortSignal): Promise<OpenAtResult>;
    status(sessionId: string, _signal?: AbortSignal): Promise<RollbackStatusResult>;
    prepareTurn(sessionId: string, turn: number, _signal?: AbortSignal): Promise<RollbackPrepareTurnResult>;
    sessionChanges(sessionId: string, _signal?: AbortSignal): Promise<RollbackSessionChangesResult>;
    acceptAll(request: RollbackAcceptAllRequest, _signal?: AbortSignal): Promise<RollbackAcceptAllResult>;
    acceptFile(request: RollbackAcceptFileRequest, _signal?: AbortSignal): Promise<RollbackAcceptResult>;
    acceptModification(request: RollbackAcceptModificationRequest, _signal?: AbortSignal): Promise<RollbackAcceptResult>;
    undoAll(request: RollbackUndoAllRequest, _signal?: AbortSignal): Promise<RollbackUndoAllResult>;
    undoFile(request: RollbackUndoFileRequest, _signal?: AbortSignal): Promise<RollbackUndoFileResult>;
    undoModification(request: RollbackUndoModificationRequest, _signal?: AbortSignal): Promise<RollbackUndoModificationResult>;
}
