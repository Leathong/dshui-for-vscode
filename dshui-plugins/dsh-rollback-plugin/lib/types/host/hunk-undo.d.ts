import type { GitProvider } from './providers/git.ts';
import type { RollbackHunk } from '../shared/types.ts';
/**
 * Forward-only patch surgery (docs/git-only-plan.md §2.6, §2.7).
 *
 * Undo is expressed as "keep every hunk except these", applied *forward* onto
 * the accepted tree — no reverse diff is ever built, and the accepted tree is
 * the only pre-image needed. Patch undo replays the same idea across a call
 * chain, so the former `git merge-file` reverse merge is gone.
 */
export type PatchFileStatus = 'added' | 'deleted' | 'modified' | 'binary';
export interface PatchFile {
    path: string;
    status: PatchFileStatus;
    /** Section lines before the first hunk (`diff --git`, `index`, `---`, `+++`). */
    header: string;
    /** Complete hunk blocks, each starting at its `@@ ` line. */
    hunks: string[];
    /** Post-image blob of the worktree side (from the `index` line). */
    oldBlob?: string;
    newBlob?: string;
}
export interface PatchFileView extends PatchFile {
    view: RollbackHunk[];
    /** Stable per-hunk identity for the client (header + body digest). */
    fingerprints: string[];
    truncated: boolean;
    binary: boolean;
}
/** Split a multi-file patch into per-file sections with complete hunks. */
export declare function splitPatchFiles(patch: string): PatchFile[];
/** Stable identity of one hunk block, used to bind a selection across refreshes. */
export declare function hunkFingerprint(hunk: string): string;
/** Per-file views with display hunks, fingerprints and truncation limits. */
export declare function patchFileViews(patch: string, maxHunks: number, maxBytes: number): PatchFileView[];
export interface HunkUndoOptions {
    /** Accepted commit the complement is applied onto. */
    acceptedCommit: string;
    path: string;
    /** Indexes of the hunks to undo; everything else is kept. */
    undo: readonly number[];
    /** Diff context used to enumerate hunks (must match the client's view). */
    context: number;
}
export interface HunkUndoResult {
    ok: boolean;
    undone: number;
    reason?: string;
}
/**
 * Undo the selected hunks of one file. The worktree is only written after the
 * forward complement applied cleanly to the index.
 */
export declare function applyHunkUndo(provider: GitProvider, scratchIndex: string, options: HunkUndoOptions): Promise<HunkUndoResult>;
export interface PatchReplayStep {
    path: string;
    /** Patch introduced by this call (`from` → `to`). */
    patch: string;
}
export interface PatchReplayResult {
    ok: boolean;
    reason?: string;
    /** Index of the step that failed, when `ok` is false. */
    failedStep?: number;
}
/**
 * Rebuild a file as "accepted + every call except the skipped one", applying
 * each call's patch forward in order. A step that no longer applies on its own
 * falls back to a three-way merge (all pre-images are in the object store).
 */
export declare function replayPatches(provider: GitProvider, scratchIndex: string, base: string, steps: readonly PatchReplayStep[], skip: ReadonlySet<number>): Promise<PatchReplayResult>;
