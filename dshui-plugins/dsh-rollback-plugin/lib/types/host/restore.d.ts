import type { OpenAtRequest, OpenAtValue, RollbackExecuteRequest, RollbackExecuteResult, RollbackFileChange, RollbackModification, RollbackPrepareResult, RollbackResult, RollbackStatusValue } from '../shared/types.ts';
import type { RollbackCordisContext, Session } from './context.ts';
import { ChangeLedger } from './ledger.ts';
import type { LedgerModificationRecord } from './ledger.ts';
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
    /** Turn-anchored prepare: also serves unfinished (stopped) turns. */
    prepareTurn(sessionId: string, turn: number): Promise<RollbackPrepareResult>;
    private prepareBase;
    private prepareWithBoundary;
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
export declare function parseRecordArgs(raw: string | undefined): Record<string, unknown>;
/** Reusable modification builder: ledger records + log-only write/edit events. */
export declare function buildModificationsFromRecords(cwd: string, events: readonly Session['events'][number][], records: readonly LedgerModificationRecord[], later: (record: LedgerModificationRecord) => LedgerModificationRecord[], turn?: number): RollbackModification[];
/** Attach per-path tool-call patch lists onto file-level changes. */
export declare function attachToolCallsToChanges(changes: RollbackFileChange[], modifications: readonly RollbackModification[]): void;
export declare function sessionLogHunks(event: {
    type: string;
    data: unknown;
} | undefined, args: Record<string, unknown>): RollbackModification['hunks'];
export declare function recordHunks(record: LedgerModificationRecord): RollbackModification['hunks'];
