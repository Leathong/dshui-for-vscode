import type { RollbackSnapshotInfo, RollbackSnapshotManifest } from '../shared/types.ts';
import type { RollbackCordisContext, Session } from './context.ts';
import { GitProvider } from './providers/git.ts';
export interface SnapshotManagerOptions {
    maxSnapshotsPerSession: number;
    ledgerDir: string;
    spawnTimeoutMs: number;
    maxDiffHunksPerFile: number;
    maxDiffBytesPerFile: number;
    restoreChunkSize: number;
    /** Override the DSH home (tests); defaults to resolveDshHome(). */
    dshHome?: string;
}
/**
 * Encode an arbitrary string as one filesystem-safe path segment, mirroring
 * the JSONL session persistence layout (`@deepseek-ai/dsh-session-persistence-jsonl`):
 * safe code units stay literal, everything else becomes `~XXXX`.
 */
export declare function encodeSessionSegment(raw: string): string;
/**
 * The readable per-project directory key, mirroring the JSONL persistence
 * layout: separators become `-`, unsafe units `~XXXX`, bounded and wrapped
 * in `--…--`.
 */
export declare function projectDirKey(cwd: string): string;
/**
 * The on-disk directory DSH owns for one session, mirroring the JSONL
 * persistence backend: `<DSH_HOME>/sessions/<projectKey(cwd)>/<sessionId>`.
 * Session-local artifacts placed here are removed together with the session.
 */
export declare function sessionDirFor(dshHome: string, cwd: string | undefined, sessionId: string): string;
/** The isolated bare snapshot repo for one session, inside its session dir. */
export declare function sessionSnapshotRepo(dshHome: string, cwd: string | undefined, sessionId: string): string;
export declare function resolveDshHome(): string;
export declare function changeLedgerRoot(): string;
export declare function manifestsPath(): string;
export declare function journalsPath(): string;
export declare function locksDir(): string;
export declare function readJsonFile<T>(file: string, fallback: T): Promise<T>;
export declare function writeJsonFileAtomic<T>(file: string, value: T): Promise<void>;
export declare const POINTS_PREFIX = "refs/dsh/points/";
/**
 * `refs/dsh/end`: worktree tree captured when the session is disposed. It is
 * the boundary between changes made during the session and changes made after
 * it, not a rollback target (the last turn point still predates the last
 * turn's writes, so it cannot serve that purpose).
 */
export declare const SESSION_END_REF = "refs/dsh/end";
/**
 * `refs/dsh/turn-end`: worktree tree captured immediately after a `turn/end`.
 * It is the per-turn boundary used to tell changes made while the turn was
 * running (part of the session) from changes made after it ended. Only the
 * latest turn is kept; each completed turn replaces it.
 */
export declare const TURN_END_REF = "refs/dsh/turn-end";
/**
 * `refs/dsh/gap`: cumulative tree of paths whose current content was last
 * changed outside any turn (between two turns, or while the session was
 * closed). `refs/dsh/gap-deleted` records paths whose last gap change was a
 * deletion (presence only; blob content is the pre-deletion object).
 *
 * The gap trees are updated at every turn start by diffing the previous
 * turn-end tree against the new turn-start tree. They let the modification
 * list exclude changes that happened while no turn was running, without a
 * per-path replay over every historic snapshot.
 */
export declare const GAP_REF = "refs/dsh/gap";
export declare const GAP_DELETED_REF = "refs/dsh/gap-deleted";
/**
 * Turn-start rollback points, stored as git commits
 * (docs/git-only-plan.md §2.1).
 *
 * `refs/dsh/points/<nnnn>` is a full-worktree commit taken at the start of a
 * turn; everything the old manifest store kept (snapshot ids, JSON files, the
 * storage-domain table) is now a ref. The full `add -A` is the only
 * O(worktree) operation left, and it reuses a persistent index so unchanged
 * files are not re-hashed.
 */
export declare class SnapshotManager {
    private readonly options;
    private readonly ctx?;
    /** In-memory manifests for the current process (never persisted). */
    private readonly manifests;
    /** Nested-repository roots per workspace cwd, refreshed by `capture`. */
    private readonly nestedRootsCache;
    private readonly dshHome;
    /** In-flight isolated repo inits, keyed by repo dir (dedupe across providers). */
    private readonly isolatedInit;
    /**
     * Per-session capture serialization. Turn-start, turn-end and session-end
     * captures all reuse the provider's persistent scan index, so overlapping
     * runs would interleave `add -A`/`write-tree` on one index file.
     */
    private readonly captureQueues;
    constructor(options: SnapshotManagerOptions, ctx?: RollbackCordisContext | undefined);
    get ledgerDir(): string;
    /**
     * Run `run` after any capture already queued for this session. A failed
     * predecessor never blocks the next capture; the queue entry is dropped once
     * the chain drains.
     */
    private queueCapture;
    /**
     * Provider bound to one session's isolated snapshot repo (kept inside the
     * session's own directory, so deleting the session removes the objects).
     */
    providerFor(cwd: string, sessionId?: string): GitProvider;
    private ensureIsolatedRepo;
    /**
     * Workspace-relative roots of the nested git repositories under `cwd`.
     *
     * Discovery costs a full `readdir` + per-directory `lstat` walk of the
     * workspace (seconds on a large checkout), so the result is cached per cwd
     * and refreshed by every turn `capture`, which already discovers nested
     * repositories while materializing the snapshot. Callers on the list path
     * must never pay that walk per refresh.
     */
    nestedRoots(cwd: string, provider: GitProvider): Promise<string[]>;
    /** Capture the turn-start point. Failures never block the agent. */
    capture(session: Session, turn: number): Promise<RollbackSnapshotManifest | undefined>;
    private capturePoint;
    /**
     * Capture the worktree at session disposal into {@link SESSION_END_REF}.
     *
     * A turn point is taken at turn *start*, so the newest point of a session
     * predates its last turn's writes and cannot mark the session's end. This is
     * the fallback end boundary for a close that happened inside a turn (or
     * before any turn ended); a normal turn end records {@link TURN_END_REF}
     * instead, which is stricter about changes made after the last turn.
     */
    captureEnd(session: Session): Promise<string | undefined>;
    /**
     * Capture the worktree immediately after `turn/end` into {@link TURN_END_REF}.
     * This is the per-turn boundary: changes made after the turn are excluded
     * while the session stays idle, while everything the turn itself produced
     * stays in the list.
     */
    captureTurnEnd(session: Session, turn: number): Promise<string | undefined>;
    private captureBoundary;
    /** Tree and capture time of the last session-end boundary, if one exists. */
    endBoundary(cwd: string, sessionId: string): Promise<{
        tree: string;
        createdAt: number;
    } | undefined>;
    /** Tree and capture time of the latest turn-end boundary, if one exists. */
    turnEndBoundary(cwd: string, sessionId: string): Promise<{
        tree: string;
        createdAt: number;
    } | undefined>;
    /** Wait for every capture queued for this session (turn start/end, gaps). */
    waitForCaptures(cwd: string, sessionId: string): Promise<void>;
    /**
     * Record the changes made between the previous turn's end and this turn's
     * start into the cumulative gap trees.
     *
     * `boundaryAt` is the previous `turn/end` event time; a stale turn-end ref
     * (its capture time is older than that event) is not used. Entries touching a
     * gitlink are skipped because their objects are not worktree blobs. The two
     * trees are cumulative: a path updated here leaves the other tree.
     */
    recordGap(session: Session, turn: number, startTree: string, boundaryAt: number): Promise<void>;
    private recordGapNow;
    /** Cumulative gap trees for this session, if any gap was recorded. */
    gapState(cwd: string, sessionId: string): Promise<{
        gapTree?: string;
        deletedTree?: string;
    }>;
    private treeForRef;
    /**
     * The capture time lets a reader reject a boundary left behind by an earlier
     * lifecycle when the latest capture failed (a stale tree would misclassify
     * changes that happened in between).
     */
    private refBoundary;
    /** Whether this session ever created an isolated snapshot repository. */
    hasRepository(cwd: string, sessionId: string): boolean;
    /** Exact point first, then the newest earlier point for the same session. */
    find(cwd: string, sessionId: string, targetTurn: number): Promise<{
        manifest: RollbackSnapshotManifest;
        degraded: boolean;
    } | undefined>;
    listPoints(cwd: string, sessionId: string, provider?: GitProvider): Promise<RollbackSnapshotManifest[]>;
    ensureTreeAvailable(manifest: RollbackSnapshotManifest, provider: GitProvider): Promise<boolean>;
    snapshotInfo(manifest: RollbackSnapshotManifest, degraded: boolean): RollbackSnapshotInfo;
    /** Drop the oldest points beyond `maxSnapshotsPerSession`. */
    private prune;
    private manifestAt;
}
/** `refs/dsh/points/<nnnn>`: zero padded so ref order equals turn order. */
export declare function pointRef(turn: number): string;
