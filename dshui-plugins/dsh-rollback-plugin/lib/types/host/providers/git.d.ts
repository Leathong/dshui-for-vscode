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
    /**
     * Ceiling on nested git repositories materialized per capture. Directories
     * beyond the cap stay gitlinks (their internals remain ledger-covered).
     */
    maxNestedRepos?: number;
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
/** A nested git repository inside the snapshot worktree, ordered leaf-first. */
export interface NestedRepoInfo {
    /** Absolute path to the nested repository's worktree root. */
    root: string;
    /** Absolute path to the nested repository's own git dir (`.git`). */
    gitDir: string;
    /** Workspace-relative path with forward slashes ('' for cwd itself). */
    rel: string;
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
    /** Cap on nested repositories materialized per capture (from options). */
    private readonly maxNestedRepos;
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
    /**
     * Snapshot the entire worktree with nested git repositories materialized
     * as directory trees instead of gitlinks, so nested files get plain git
     * diff/restore coverage. `materialized` reports whether any nested
     * directory was spliced in. Materialization is best-effort: discovery or
     * capture failures leave the gitlinks in place, exactly like before.
     *
     * Discovery is driven entirely by git plumbing (tree inspection + exit
     * codes), never by parsing human-readable `add -A` stderr.
     */
    captureTreeInfo(signal?: AbortSignal): Promise<{
        tree: string;
        materialized: boolean;
    }>;
    /**
     * Nested git repositories under the worktree, in post-order (a repo's
     * deeper children appear before it), excluding the worktree root itself.
     * Used for display labeling. See `scanNestedRepos` for mechanics.
     */
    listNestedRepos(accept?: (info: NestedRepoInfo) => boolean | Promise<boolean>): Promise<NestedRepoInfo[]>;
    /**
     * Walk the real directory tree under `dir` (bounded, symlinks not
     * followed, `.git` entries skipped) and return nested repositories in
     * post-order, with `rel` relative to `dir`. `rev-parse` is spawned only
     * for directories that actually contain a `.git` entry (dir or gitfile),
     * so the walk cost is one lstat per directory entry.
     */
    private scanNestedRepos;
    /** Workspace-relative gitlink paths stored in a tree snapshot. */
    private gitlinkPaths;
    /** Capture one worktree (the workspace root or a nested repository root). */
    private captureWorktree;
    /** Whether a repository has a resolvable HEAD (false ⇒ commitless/bare). */
    private hasHead;
    /** Replace gitlink records by directory trees (materialization) via a throwaway index. */
    private replaceGitlinks;
    /** Run git against the isolated repo from an arbitrary worktree. */
    private runAt;
    treeExists(tree: string, signal?: AbortSignal): Promise<boolean>;
    diffEntries(from: string, to: string, signal?: AbortSignal, alternateObjectDirs?: readonly string[]): Promise<GitTreeEntry[]>;
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
    /**
     * All snapshot object operations run against the isolated repo.
     * `alternateObjectDirs` borrows additional object stores read-only (git
     * alternates), used to diff against tree objects captured by other
     * sessions into their own isolated repos.
     */
    run(args: readonly string[], signal?: AbortSignal, indexFile?: string, alternateObjectDirs?: readonly string[]): Promise<GitRunResult>;
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
