import type { RollbackFileChange, RollbackHunk } from '../shared/types.ts';
import type { FsObservation, FsTarget, RollbackCordisContext, RollbackToolActor } from './context.ts';
export interface LedgerOptions {
    ledgerMaxTextBytes: number;
    /** Cap on persisted records per session; the oldest records are trimmed first. */
    maxLedgerRecordsPerSession?: number;
    /** Override the persistence file (tests and tooling). */
    ledgerFile?: string;
}
export interface LedgerModificationRecord {
    modificationId: string;
    toolName: 'write' | 'edit';
    path: string;
    sessionId: string;
    turn: number;
    step: number;
    seq: number;
    argsRaw?: string;
    beforeExisted: boolean;
    beforeVersion?: string;
    beforeContent?: string;
    beforeBinary?: boolean;
    observedVersion?: string;
    createdAt: number;
}
interface LedgerEventLike {
    type: string;
    data: unknown;
    seq: number;
}
export declare function normalizeLf(text: string): string;
/** Compute a whole-file diff hunk between two text snapshots. */
export declare function wholeFileHunk(before: string | null, after: string): RollbackHunk[];
/** Open turn/step for a session, derived from the durable log boundaries. */
export declare function sessionTurnPosition(session: {
    readonly events: readonly LedgerEventLike[];
}): {
    turn: number;
    step: number;
    seq: number;
} | undefined;
/** Persistence file for ledger records (JSON fallback next to the manifests). */
export declare function ledgerRecordsPath(): string;
export declare class ChangeLedger {
    private readonly ctx;
    private readonly options;
    private readonly records;
    private readonly pending;
    private writeTail;
    private readonly maxLedgerRecordsPerSession;
    private readonly ledgerFile;
    constructor(ctx: RollbackCordisContext, options: LedgerOptions);
    get ledgerMaxTextBytes(): number;
    /** Prepend listener for fs/write-intent; must call next() so the policy slot stays intact. */
    captureWriteBefore<T>(target: FsTarget, actor: RollbackToolActor | undefined, next: () => T | Promise<T>): Promise<T>;
    /** Prepend listener for fs/edit-intent; must call next() so the policy slot stays intact. */
    captureEditBefore<T>(target: FsTarget, actor: RollbackToolActor | undefined, next: () => T | Promise<T>): Promise<T>;
    /** Record a successful fs observation against a pending write/edit capture. */
    observe(target: FsTarget, observation: FsObservation, actor: RollbackToolActor | undefined): void;
    list(sessionId?: string): readonly LedgerModificationRecord[];
    listForTurn(sessionId: string, turn: number): LedgerModificationRecord[];
    /** Earliest before-image for one path during the target turn. */
    baselineForTurn(sessionId: string, turn: number, filePath: string): LedgerModificationRecord | undefined;
    /** All modifications for a path at or after one record, newest first. */
    laterModifications(sessionId: string, filePath: string, after: LedgerModificationRecord): LedgerModificationRecord[];
    recordById(sessionId: string, modificationId: string): LedgerModificationRecord | undefined;
    /** Await pending persistence (tests and graceful shutdown paths). */
    flush(): Promise<void>;
    private enqueuePersist;
    /** Build file-level changes for ledger-covered paths that git snapshots cannot see. */
    buildFileChanges(sessionId: string, turn: number, cwd: string, mode: 'ignored' | 'fallback'): Promise<RollbackFileChange[]>;
    fileChangeForBaseline(cwd: string, rel: string, baseline: LedgerModificationRecord, mode: 'ignored' | 'fallback'): Promise<RollbackFileChange | undefined>;
    /** Restore one ledger-covered path through ctx.fs, bypassing the tool waterfall. */
    restoreLedgerPath(cwd: string, rel: string, baseline: LedgerModificationRecord, createdPolicy: 'keep' | 'delete'): Promise<'restored' | 'kept' | 'deleted' | 'unsupported'>;
    readCurrentForGuard(cwd: string, rel: string): Promise<{
        existed: boolean;
        version?: string;
        size?: number;
        content?: string;
    }>;
    restoreGuardFile(cwd: string, rel: string, guard: {
        existed: boolean;
        version?: string;
        content?: string;
    }): Promise<void>;
    private captureBefore;
    private positionForCall;
    private readText;
}
export {};
