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
    constructor(options: SnapshotManagerOptions, ctx?: RollbackCordisContext | undefined);
    get ledgerDir(): string;
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
