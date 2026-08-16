import type { OpenAtRequest, OpenAtValue, RollbackExecuteRequest, RollbackExecuteResult, RollbackPrepareResult, RollbackResult, RollbackStatusValue } from '../shared/types.ts';
import type { RollbackCordisContext } from './context.ts';
import { ChangeLedger } from './ledger.ts';
import { RollbackSafety } from './safety.ts';
import { SnapshotManager } from './snapshot.ts';
export interface RestoreOptions {
    maxDiffHunksPerFile: number;
    maxDiffBytesPerFile: number;
    restoreChunkSize: number;
    spawnTimeoutMs: number;
}
export declare class RollbackRestore {
    private readonly ctx;
    private readonly snapshots;
    private readonly ledger;
    private readonly safety;
    private readonly options;
    private readonly prepared;
    constructor(ctx: RollbackCordisContext, snapshots: SnapshotManager, ledger: ChangeLedger, safety: RollbackSafety, options: RestoreOptions);
    prepare(sessionId: string, messageId: string): Promise<RollbackPrepareResult>;
    execute(request: RollbackExecuteRequest): Promise<RollbackExecuteResult>;
    status(sessionId: string): Promise<RollbackResult<RollbackStatusValue>>;
    openAt(sessionId: string, request: OpenAtRequest): Promise<RollbackResult<OpenAtValue>>;
    private liveSession;
    private selectFilePaths;
    private buildModifications;
    private attachToolCalls;
    private executeModifications;
    private executeFailure;
    private finishGuard;
}
