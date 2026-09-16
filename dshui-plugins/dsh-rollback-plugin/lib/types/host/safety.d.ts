import type { RollbackLockInfo } from '../shared/types.ts';
import type { RollbackCordisContext } from './context.ts';
import type { GitProvider } from './providers/git.ts';
/**
 * Workspace safety: the cross-process lock stays a lock file (git has no
 * cross-process long transaction), while the undo guard and the journal become
 * git refs inside the session's isolated repo (docs/git-only-plan.md §6):
 * `refs/dsh/guards/<id>` is a path-scoped commit holding the pre-rollback
 * content, and `refs/dsh/journals/<id>` is a commit chain whose tip message
 * carries the current phase. No guard/journal JSON remains.
 */
export interface SafetyOptions {
    lockStaleMs: number;
    guardRetentionMs: number;
    lockTimeoutMs: number;
}
export declare const GUARDS_PREFIX = "refs/dsh/guards/";
export declare const JOURNALS_PREFIX = "refs/dsh/journals/";
export type JournalPhase = 'running' | 'completed' | 'rolled-back' | 'interrupted';
export interface GitGuard {
    guardId: string;
    commit: string;
    cwd: string;
    sessionId: string;
    /** Paths whose pre-rollback content is in the guard tree. */
    present: string[];
    /** Paths that did not exist before the rollback. */
    absent: string[];
}
export interface JournalRecord {
    id: string;
    phase: JournalPhase;
    guardId?: string;
    cwd?: string;
    sessionId?: string;
    paths: string[];
    createdAt: number;
    updatedAt: number;
}
export declare class RollbackSafety {
    private readonly options;
    private lock;
    private lockFile;
    constructor(options: SafetyOptions);
    hashWorkspace(cwd: string): string;
    acquire(cwd: string): Promise<void>;
    release(): Promise<void>;
    readLock(cwd: string): Promise<RollbackLockInfo | undefined>;
    assertFences(ctx: RollbackCordisContext, cwd: string, provider: GitProvider): Promise<void>;
    /**
     * Guard the pre-rollback content of `paths` as a git commit, so a failed
     * rollback can be undone with a plain forward restore.
     */
    captureGuard(provider: GitProvider, context: {
        cwd: string;
        sessionId: string;
    }, paths: readonly string[]): Promise<GitGuard>;
    /** Restore the guarded content of the selected paths (all of them by default). */
    restoreGuard(provider: GitProvider, guard: GitGuard, paths?: readonly string[]): Promise<void>;
    loadGuard(provider: GitProvider, guardId: string): Promise<GitGuard | undefined>;
    /** Open a journal entry (`running`) for a rollback about to start. */
    journalStart(provider: GitProvider, guard: GitGuard, paths: readonly string[]): Promise<string>;
    journalUpdate(provider: GitProvider, id: string, phase: JournalPhase): Promise<void>;
    listJournals(provider: GitProvider): Promise<JournalRecord[]>;
    /**
     * Undo rollbacks that a dead owner left `running`, using the guard commit.
     * Journals live in the session's isolated repo, so only sessions that still
     * exist are reconciled (a deleted session takes its guard with it).
     */
    reconcileRunning(ctx: RollbackCordisContext, snapshots: import('./snapshot.ts').SnapshotManager): Promise<void>;
    private writeJournal;
    /** The empty tree, used for the first commit of a journal chain. */
    private emptyTree;
    private readJournal;
    private isStale;
}
