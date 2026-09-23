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
     * the rest as `foreign`.
     *
     * A path is ours when the newest tracked call for it has no usable post-image
     * (oversized, superseded, never frozen — the permissive legacy semantics) or
     * when the worktree still matches that post-image. Everything else was
     * written by another session or outside the tool chain, including a file this
     * session wrote and somebody else overwrote afterwards.
     */
    private attributeChanges;
    /**
     * Post-image blob of each call, keyed by `callId`. Deletions map to
     * `undefined`; calls without a usable post-image are absent from the map so
     * callers can tell "the call removed the file" from "nothing recorded".
     */
    private callPostImages;
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
