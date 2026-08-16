import type { RollbackGuardFile, RollbackJournalEntry, RollbackLockInfo } from '../shared/types.ts';
import type { RollbackCordisContext } from './context.ts';
import { ChangeLedger } from './ledger.ts';
import { GitProvider } from './providers/git.ts';
export interface SafetyOptions {
    lockStaleMs: number;
    guardRetentionMs: number;
    ledgerDir: string;
    lockTimeoutMs: number;
}
export declare class RollbackSafety {
    private readonly options;
    private lock;
    private lockFile;
    private readonly journals;
    private readonly guards;
    private journalsLoaded;
    private writeTail;
    constructor(options: SafetyOptions);
    get ledgerDir(): string;
    hashWorkspace(cwd: string): string;
    acquire(cwd: string): Promise<void>;
    release(): Promise<void>;
    readLock(cwd: string): Promise<RollbackLockInfo | undefined>;
    assertFences(ctx: RollbackCordisContext, cwd: string, provider: GitProvider): Promise<void>;
    captureGuard(ctx: RollbackCordisContext, provider: GitProvider, cwd: string, tree: string | undefined, ledgerPaths: readonly string[], ledger: ChangeLedger): Promise<{
        guardId: string;
        record: {
            tree?: string;
            ledgerFiles: RollbackGuardFile[];
            cwd: string;
        };
    }>;
    journalStart(guardId: string, paths: readonly string[]): Promise<RollbackJournalEntry>;
    journalUpdate(id: string, phase: RollbackJournalEntry['phase']): Promise<void>;
    listJournals(cwd: string): Promise<RollbackJournalEntry[]>;
    rollbackGuard(ctx: RollbackCordisContext, provider: GitProvider, ledger: ChangeLedger, guardId: string, paths: readonly string[]): Promise<void>;
    loadGuards(): Promise<void>;
    private persistGuards;
    private loadJournals;
    private persistJournals;
    /** Reconcile journals left in `running` by a dead owner at startup. */
    reconcileRunning(ctx: RollbackCordisContext, snapshots: import('./snapshot.ts').SnapshotManager, ledger: ChangeLedger): Promise<void>;
    private isStale;
}
