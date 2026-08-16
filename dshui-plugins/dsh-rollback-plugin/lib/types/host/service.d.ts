import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { OpenAtResult, RollbackExecuteRequest, RollbackExecuteResult, RollbackPrepareResult, RollbackStatusResult } from '../shared/types.ts';
import type { RollbackCordisContext } from './context.ts';
import { ChangeLedger } from './ledger.ts';
import { RollbackRestore } from './restore.ts';
import { RollbackSafety } from './safety.ts';
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
    readonly restore: RollbackRestore;
    constructor(ctx: Context, config?: Partial<RollbackHostConfig>);
    prepare(sessionId: string, messageId: string, _signal?: AbortSignal): Promise<RollbackPrepareResult>;
    execute(request: RollbackExecuteRequest, _signal?: AbortSignal): Promise<RollbackExecuteResult>;
    openAt(sessionId: string, path: string, line?: number, _signal?: AbortSignal): Promise<OpenAtResult>;
    status(sessionId: string, _signal?: AbortSignal): Promise<RollbackStatusResult>;
}
