import type { OpenAtRequest, OpenAtValue, RollbackExecuteRequest, RollbackExecuteResult, RollbackPrepareResult, RollbackResult, RollbackStatusValue } from '../shared/types.ts';
import type { RollbackCordisContext } from './context.ts';
import { RollbackSafety } from './safety.ts';
import { SnapshotManager } from './snapshot.ts';
import type { CallTracker } from './tracking.ts';
export interface RestoreOptions {
    maxDiffHunksPerFile: number;
    maxDiffBytesPerFile: number;
    restoreChunkSize: number;
    spawnTimeoutMs: number;
}
export declare class RollbackRestore {
    private readonly ctx;
    private readonly snapshots;
    private readonly tracker;
    private readonly safety;
    private readonly options;
    private readonly prepared;
    constructor(ctx: RollbackCordisContext, snapshots: SnapshotManager, tracker: CallTracker, safety: RollbackSafety, options: RestoreOptions);
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
    /**
     * Attribute every previewed change to this session's tool-call chain and flag
     * the rest as `foreign` (see `foreignPaths`).
     */
    private attributeChanges;
    /** Per-call patches of one turn, read from the tracked commit chain. */
    private buildModifications;
    /**
     * `scope='modifications'`: rebuild each affected file as "turn-start state +
     * every call of the turn except the selected ones", applied forward in call
     * order (docs/git-only-plan.md §2.7).
     */
    private executeModifications;
    /** One call's forward patch (`<commit>^` → `<commit>`), path-limited. */
    private callPatch;
    private executeFailure;
    private finishGuard;
}
