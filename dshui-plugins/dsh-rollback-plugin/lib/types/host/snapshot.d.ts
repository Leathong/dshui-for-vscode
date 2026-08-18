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
export declare class SnapshotManager {
    private readonly options;
    private readonly ctx?;
    private manifests;
    private loaded;
    private writeTail;
    private domainStorePromise?;
    private readonly dshHome;
    /** In-flight isolated repo inits, keyed by repo dir (dedupe across providers). */
    private readonly isolatedInit;
    constructor(options: SnapshotManagerOptions, ctx?: RollbackCordisContext | undefined);
    get ledgerDir(): string;
    /**
     * Provider bound to one session's isolated snapshot repo (kept inside the
     * session's own directory, so deleting the session removes the objects).
     * `sessionId` undefined degrades to ledger-only coverage.
     */
    providerFor(cwd: string, sessionId?: string): GitProvider;
    private ensureIsolatedRepo;
    /** Capture the pre-step baseline. Failures are caught by the caller and never block the agent. */
    capture(session: Session, turn: number): Promise<RollbackSnapshotManifest | undefined>;
    /** Exact snapshot first, then the newest earlier snapshot for the same session. */
    find(sessionId: string, targetTurn: number): Promise<{
        manifest: RollbackSnapshotManifest;
        degraded: boolean;
    } | undefined>;
    ensureTreeAvailable(manifest: RollbackSnapshotManifest, provider: GitProvider): Promise<boolean>;
    snapshotInfo(manifest: RollbackSnapshotManifest, degraded: boolean): RollbackSnapshotInfo;
    listForSession(sessionId: string): Promise<RollbackSnapshotManifest[]>;
    /** All manifests captured in one workspace (any session), oldest first. */
    listForWorkspace(cwd: string): Promise<RollbackSnapshotManifest[]>;
    private load;
    private enqueuePersist;
    /** Open the storage-domain table when the Host composition provides one. */
    private domainStore;
    private openDomainStore;
}
