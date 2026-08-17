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
}
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
    constructor(options: SnapshotManagerOptions, ctx?: RollbackCordisContext | undefined);
    get ledgerDir(): string;
    providerFor(cwd: string): GitProvider;
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
