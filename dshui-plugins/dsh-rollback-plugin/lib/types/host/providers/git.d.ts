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
     * beyond the cap stay gitlinks (their internals are not tracked per call).
     */
    maxNestedRepos?: number;
}
/** One entry for a batched `update-index --index-info` call. */
export interface GitIndexEntry {
    path: string;
    /** Blob hash; omitted removes the path from the index. */
    blob?: string;
    mode?: string;
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
export declare function spawnGit(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs: number, signal?: AbortSignal, gitDir?: string, workTree?: string, input?: string): Promise<GitRunResult>;
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
        nested: string[] | undefined;
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
    /**
     * Resolve many `<treeish>:<path>` lookups in **one** process
     * (`cat-file --batch-check`), positionally. `undefined` means the spec does
     * not resolve (absent path, unresolvable treeish, or git unavailable).
     *
     * This is the batch form of `blobHash` and the reason the accept/list hot
     * paths no longer spawn one `rev-parse` per changed file: on a 35-file list
     * the per-path form costs ~0.5 s, this one ~20 ms. Specs whose path cannot
     * ride the line protocol (a newline in the name) fall back to `blobHash`,
     * as does the whole batch when the process fails.
     */
    blobHashes(specs: ReadonlyArray<{
        treeish: string;
        path: string;
    }>, signal?: AbortSignal): Promise<Array<string | undefined>>;
    fileHash(relPath: string, signal?: AbortSignal): Promise<string | undefined>;
    /**
     * Hash many worktree files in **one** process
     * (`hash-object [-w] --stdin-paths`), keyed by workspace-relative path.
     * Absent paths map to `undefined`, exactly like `fileHash` / `writeBlob`;
     * with `write` the blobs are also stored in the object store.
     *
     * `hash-object --stdin-paths` dies on the first missing file, so absent
     * paths are filtered with a stat before the call and the batch falls back to
     * per-path spawns when the process fails (or for a path that cannot ride the
     * line protocol).
     */
    hashBlobs(relPaths: readonly string[], options?: {
        write?: boolean;
        signal?: AbortSignal;
    }): Promise<Map<string, string | undefined>>;
    /**
     * Run `body` with a **private** throwaway index.
     *
     * Scratch work (accept, hunk/patch application, guard capture, list diffs)
     * must never share an index file: two overlapping operations would
     * interleave `read-tree` / `apply --cached` / `write-tree` and could publish
     * a corrupted tree. `update-ref`'s compare-and-swap protects the ref, not the
     * tree, so isolation has to happen here.
     */
    withScratch<T>(body: (indexFile: string) => Promise<T>): Promise<T>;
    /**
     * A persistent index file inside the isolated repo. `scan` backs the
     * full-worktree `add -A` (its stat cache must survive between captures).
     * Use `withScratch` for every other index need.
     */
    indexPath(kind: 'scan' | 'scratch'): string | undefined;
    /**
     * Write a worktree file into the isolated object store and return its blob
     * hash. `undefined` when the path is absent or unreadable, which the caller
     * records as a deletion.
     */
    writeBlob(absPath: string, signal?: AbortSignal): Promise<string | undefined>;
    /** `write-tree` from an explicit index file. */
    writeTree(indexFile: string, signal?: AbortSignal): Promise<string>;
    /** Reset an index file to a tree-ish (`read-tree`; `--empty` when omitted). */
    readTree(indexFile: string, treeish?: string, signal?: AbortSignal): Promise<void>;
    /**
     * Register many index entries in a single git process (`update-index
     * --index-info`). An entry without `blob` removes the path.
     */
    updateIndexInfo(indexFile: string, entries: readonly GitIndexEntry[], signal?: AbortSignal): Promise<void>;
    /**
     * Apply a patch to an index only (never the worktree). The caller follows
     * with `checkoutIndex` to materialize the result. This is the forward-only
     * primitive behind hunk undo and patch replay.
     */
    applyCached(indexFile: string, patch: string, options?: {
        unidiffZero?: boolean;
        threeWay?: boolean;
    }, signal?: AbortSignal): Promise<{
        ok: boolean;
        stderr: string;
    }>;
    /**
     * Stage specific worktree paths into an index, including ignored ones
     * (`-f`). A tree-vs-worktree diff only sees paths present in the index, so
     * files created after the baseline (and ignored files) must be staged before
     * the diff, which is also what keeps the diff bounded to session paths.
     */
    stagePaths(indexFile: string, relPaths: readonly string[], signal?: AbortSignal): Promise<void>;
    /**
     * Stage worktree paths from their **content** (`hash-object -w` +
     * `update-index --index-info`) instead of `git add -f`.
     *
     * `git add -f` records no index entry for a path inside an embedded git
     * repository that has no resolvable HEAD (it exits 0 and writes nothing), so a
     * file this session *created* in such a directory would be missing from every
     * tree-vs-worktree diff — untracked paths never appear in `git diff <tree>`.
     * Feeding the blob hash to the index is content-addressed, never asks git to
     * index the embedded worktree, and covers created, modified and ignored files
     * alike.
     */
    stagePathsByContent(indexFile: string, relPaths: readonly string[], signal?: AbortSignal): Promise<void>;
    /** Write index entries from an index file into the worktree. */
    checkoutIndex(indexFile: string, relPaths: readonly string[], signal?: AbortSignal): Promise<void>;
    /**
     * The raw patch between two tree-ish values, or between a tree-ish and the
     * worktree when `to` is omitted. Output keeps its `diff --git` headers so it
     * can be fed straight back to `applyCached`. For the worktree form
     * `indexFile` must be populated from `from` (see `readTree`), otherwise git
     * reports every path as deleted.
     */
    diffPatch(from: string, to: string | undefined, relPaths: readonly string[], options?: {
        signal?: AbortSignal;
        context?: number;
        indexFile?: string;
    }): Promise<string>;
    /**
     * Per-commit patches for many commits in one process: each commit hash on
     * stdin produces its own diff against its first parent, prefixed by a line
     * containing the commit hash. This is the batched form of the per-call patch
     * list (docs/git-only-plan.md §3).
     */
    diffTreePatches(commits: readonly string[], options?: {
        context?: number;
        signal?: AbortSignal;
    }): Promise<Map<string, string>>;
    /** Create a commit object for a tree (no worktree or index involved). */ commitTree(tree: string, parents: readonly string[], message: string, options?: {
        timestamp?: number;
    }, signal?: AbortSignal): Promise<string>;
    /** Resolve a ref to its object hash, or undefined when it does not exist. */
    readRef(ref: string, signal?: AbortSignal): Promise<string | undefined>;
    /**
     * Move a ref. With `expectedOld` this is a compare-and-swap: the update
     * fails (returns false) unless the ref currently points at `expectedOld`,
     * which makes concurrent accepts safe without a lock.
     */
    updateRef(ref: string, sha: string, expectedOld?: string, signal?: AbortSignal): Promise<boolean>;
    /** Refs under a prefix, in refname order. */
    listRefs(prefix: string, signal?: AbortSignal): Promise<Array<{
        ref: string;
        sha: string;
    }>>;
    /**
     * Refs under a prefix with their commit messages in the same process
     * (`for-each-ref --format=…%(contents)`), used by the ref-backed journal.
     */
    listRefsDetailed(prefix: string, signal?: AbortSignal): Promise<Array<{
        ref: string;
        sha: string;
        contents: string;
    }>>;
    /**
     * Refs under a prefix with commit metadata in one process: refname, object
     * hash, tree hash, committer time and message. Backs the turn-point list.
     */
    listRefsWithMeta(prefix: string, signal?: AbortSignal): Promise<Array<{
        ref: string;
        sha: string;
        tree: string;
        createdAt: number;
        contents: string;
    }>>;
    /**
     * Parentless ancestors of a revision (`git rev-list --max-parents=0`), i.e.
     * the root commit(s) of its history. Used to recover the session chain base
     * of chains created before `refs/dsh/base` existed.
     */
    roots(rev: string, signal?: AbortSignal): Promise<string[]>;
    /** The tree hash a revision points at (`rev-parse <rev>^{tree}`). */
    treeOf(rev: string, signal?: AbortSignal): Promise<string>;
    /** Delete a ref (best-effort; missing refs are not an error). */
    deleteRefs(refs: readonly string[], signal?: AbortSignal): Promise<void>;
    /**
     * Build any number of commits in one process. The caller assembles the
     * fast-import stream; blobs must already exist in the isolated repo (see
     * `writeBlob`), so this is the freeze step of the per-call chain.
     */
    fastImport(stream: string, signal?: AbortSignal): Promise<void>;
    restorePaths(tree: string, relPaths: readonly string[], signal?: AbortSignal): Promise<void>;
    assertNoGitOperation(signal?: AbortSignal): Promise<boolean>;
    /** Every snapshot object operation runs against the isolated repo. */
    run(args: readonly string[], signal?: AbortSignal, indexFile?: string, _unused?: undefined, input?: string): Promise<GitRunResult>;
    /** Read-only queries against the project's own repo (head, fences). */
    private runProject;
    /** The project's git dir (`.git`), or undefined outside a git worktree. */
    private resolveProjectGitDir;
    normalizeRelPath(input: string): string;
    isWithin(input: string): boolean;
    assertSafeRelPath(input: string): void;
    absolutePath(relPath: string): string;
    private createTempIndex;
}
export declare function parseDiffTreeZ(stdout: string): GitTreeEntry[];
export declare function parseDiffHunks(stdout: string, maxHunks: number, maxBytes: number): {
    hunks: RollbackHunk[];
    truncated: boolean;
    binary: boolean;
};
/** Split a multi-file `git diff-tree -p` stream into per-file sections. */
export declare function splitDiffSections(stdout: string): string[];
/** Parse the path out of a `diff --git a/x b/x` section header (quoted or not). */
export declare function diffGitPath(line: string): string | undefined;
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
