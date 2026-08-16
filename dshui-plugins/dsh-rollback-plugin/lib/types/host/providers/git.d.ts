import type { RollbackFileChange, RollbackHunk } from '../../shared/types.ts';
export interface GitProviderOptions {
    spawnTimeoutMs: number;
    maxDiffHunksPerFile: number;
    maxDiffBytesPerFile: number;
    restoreChunkSize: number;
    ledgerDir?: string;
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
export declare function spawnGit(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs: number, signal?: AbortSignal): Promise<GitRunResult>;
export declare class GitProvider {
    readonly cwd: string;
    private readonly options;
    private readonly baseEnv;
    private isGit?;
    private gitDir?;
    constructor(cwd: string, options: GitProviderOptions);
    available(signal?: AbortSignal): Promise<boolean>;
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
    pathsInTree(tree: string, relPath?: string, signal?: AbortSignal): Promise<string[]>;
    blobHash(tree: string, relPath: string, signal?: AbortSignal): Promise<string | undefined>;
    fileHash(relPath: string, signal?: AbortSignal): Promise<string | undefined>;
    restorePaths(tree: string, relPaths: readonly string[], signal?: AbortSignal): Promise<void>;
    assertNoGitOperation(signal?: AbortSignal): Promise<boolean>;
    run(args: readonly string[], signal?: AbortSignal, indexFile?: string): Promise<GitRunResult>;
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
export declare function buildFileChange(cwd: string, entry: GitTreeEntry, hunks: RollbackHunk[], truncated: boolean, binary: boolean): RollbackFileChange;
