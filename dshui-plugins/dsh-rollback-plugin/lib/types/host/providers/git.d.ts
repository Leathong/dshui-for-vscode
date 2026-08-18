import type { RollbackFileChange, RollbackHunk } from '../../shared/types.ts';
export interface GitProviderOptions {
    spawnTimeoutMs: number;
    maxDiffHunksPerFile: number;
    maxDiffBytesPerFile: number;
    restoreChunkSize: number;
    ledgerDir?: string;
    /**
     * Absolute path to the session's isolated bare snapshot repository. Every
     * snapshot object (blobs/trees) is written and read here instead of the
     * project's own `.git/objects`, so rollback activity never touches the
     * user's repository (VSCode SCM stays undisturbed) and is never pruned by
     * the project's `git gc`. Optional: without it the provider is degraded
     * (no git snapshotting).
     */
    isolatedRepoDir?: string;
    /** In-flight `git init` for the isolated repo (avoids concurrent inits). */
    isolatedRepoInit?: Promise<boolean>;
}
export interface GitTreeEntry {
    path: string;
    status: 'A' | 'M' | 'D' | 'T';
    oldMode: string;
    newMode: string;
    oldHash: string;
    newHash: string;
}
export interface GitRunResult {
    code: number;
    stdout: string;
    stderr: string;
}
export declare function isHash(value: string): boolean;
export declare function spawnGit(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs: number, signal?: AbortSignal, gitDir?: string, workTree?: string): Promise<GitRunResult>;
export declare class GitProvider {
    readonly cwd: string;
    private readonly options;
    private readonly baseEnv;
    /** Isolated snapshot repo readiness (undefined = not yet probed). */
    private isolatedReady?;
    /** The project's own git dir (read-only fence/head queries); null = not a git worktree. */
    private projectGitDir?;
    constructor(cwd: string, options: GitProviderOptions);
    /**
     * Whether git snapshotting is usable. With the isolated snapshot repo this
     * no longer depends on the project being a git repository: every workspace
     * (git or not) can be captured at full fidelity, and non-git workspaces get
     * the same whole-worktree rollback capability as git ones.
     */
    available(signal?: AbortSignal): Promise<boolean>;
    /** Lazily create (idempotent) the session's isolated bare snapshot repo. */
    private ensureIsolated;
    /**
     * The project HEAD, for snapshot metadata only (read-only query of the
     * project's own repo; absent in non-git workspaces).
     */
    head(signal?: AbortSignal): Promise<string | undefined>;
    /** Snapshot the entire worktree into a temporary-index tree object. */
    captureTree(signal?: AbortSignal): Promise<string>;
    treeExists(tree: string, signal?: AbortSignal): Promise<boolean>;
    diffEntries(from: string, to: string, signal?: AbortSignal): Promise<GitTreeEntry[]>;
    diffHunks(from: string, to: string, filePath: string, signal?: AbortSignal): Promise<{
        hunks: RollbackHunk[];
        truncated: boolean;
        binary: boolean;
    }>;
    /**
     * Diff hunks for many paths in a single git process. `paths` must be
     * sorted; sections come back in the same order (git tree traversal is
     * lexicographic). Returns a map missing entries for any path whose section
     * is absent or out of order — the caller then falls back to per-file diffs.
     */
    diffHunksBatched(from: string, to: string, paths: readonly string[], signal?: AbortSignal): Promise<Map<string, {
        hunks: RollbackHunk[];
        truncated: boolean;
        binary: boolean;
    }>>;
    pathsInTree(tree: string, relPath?: string, signal?: AbortSignal): Promise<string[]>;
    blobHash(tree: string, relPath: string, signal?: AbortSignal): Promise<string | undefined>;
    fileHash(relPath: string, signal?: AbortSignal): Promise<string | undefined>;
    restorePaths(tree: string, relPaths: readonly string[], signal?: AbortSignal): Promise<void>;
    assertNoGitOperation(signal?: AbortSignal): Promise<boolean>;
    /** All snapshot object operations run against the isolated repo. */
    run(args: readonly string[], signal?: AbortSignal, indexFile?: string): Promise<GitRunResult>;
    /** Read-only queries against the project's own repo (head, fences). */
    private runProject;
    /** The project's git dir (`.git`), or undefined outside a git worktree. */
    private resolveProjectGitDir;
    normalizeRelPath(input: string): string;
    isWithin(input: string): boolean;
    assertSafeRelPath(input: string): void;
    absolutePath(relPath: string): string;
    private createTempIndex;
    private ledgerRelativePath;
}
export declare function parseDiffTreeZ(stdout: string): GitTreeEntry[];
export declare function parseDiffHunks(stdout: string, maxHunks: number, maxBytes: number): {
    hunks: RollbackHunk[];
    truncated: boolean;
    binary: boolean;
};
/** Split a multi-file `git diff-tree -p` stream into per-file sections. */
export declare function splitDiffSections(stdout: string): string[];
/** Undo git's C-style path quoting (core.quotePath). */
export declare function unquoteGitPath(quoted: string): string;
/**
 * Map a batched diff stream to per-path parse results. `sortedPaths` must be
 * sorted like the stream; a section count or order mismatch returns a map
 * missing the affected entries so the caller can fall back per file.
 */
export declare function splitDiffByPath(stdout: string, sortedPaths: readonly string[], maxHunks: number, maxBytes: number): Map<string, {
    hunks: RollbackHunk[];
    truncated: boolean;
    binary: boolean;
}>;
export declare function buildFileChange(cwd: string, entry: GitTreeEntry, hunks: RollbackHunk[], truncated: boolean, binary: boolean): RollbackFileChange;
