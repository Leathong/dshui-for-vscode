/**
 * Physical redirect-target validation for the P1 static audit.
 *
 * The shell — not a whitelisted program — performs every redirection, so a
 * file target is an unconfined read/write primitive. Before one call may skip
 * the sandbox, each file target must be a literal path whose physical location
 * (symlinks followed for the parent directory, final component checked with
 * `lstat`) lies inside a writable area: the session workspace root, the
 * operator's extra writable roots, the policy's additional roots, or the system
 * temp areas the stock `workspace-write` policy already grants.
 *
 * The same physical-root collection and containment predicate are reused by
 * the analyzer's absolute-command check (`match:absolute-model-writable`), so
 * "model-writable" means exactly one thing on both sides.
 *
 * Honest limits: this is a pre-spawn check. A concurrent process could still
 * swap a path component between the check and the shell's `open(2)` (TOCTOU);
 * the threat model (`docs/script-audit-spec.md` §7) accepts that.
 */
import { lstat } from 'node:fs/promises';
import type { AuditReasonCode } from './audit/types.ts';
/** The writable areas a redirect target may live in. */
export interface WritableRoots {
    /** The session's workspace root (always writable under `workspace-write`). */
    readonly workspaceRoot: string;
    /** This plugin's `extraWritableRoots` (live). */
    readonly extraWritableRoots: readonly string[];
    /** Extra roots already present on the resolved sandbox policy, if any. */
    readonly additionalWritableRoots?: readonly string[];
}
/** Frozen refusal codes this module can return (all defined by the spec). */
export type RedirectTargetFailure = Extract<AuditReasonCode, `redirect:${string}`>;
/** One redirect-target verdict. */
export type RedirectTargetCheck = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly code: RedirectTargetFailure;
    readonly detail?: string;
};
/**
 * Whether a physical path is `root` itself or lives below it (both physical).
 * @param path - the physical candidate.
 * @param root - the physical root.
 * @returns true when `path` is contained in `root`.
 */
export declare function isUnderReal(path: string, root: string): boolean;
/**
 * Whether a physical path lies inside any of the physical model-writable roots.
 * @param path - the physical path.
 * @param roots - physical roots from {@link collectWritableRoots}.
 * @returns true when the path is model-writable and must be refused.
 */
export declare function isInsideWritableRoots(path: string, roots: readonly string[]): boolean;
export declare function isMissing(error: unknown): boolean;
/** `lstat` where a missing path yields undefined, other errors propagate. */
export declare function entryInfo(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined>;
/**
 * Resolve the model-writable roots physically, skipping ones that do not
 * exist (a missing root grants nothing) and failing closed on any other
 * filesystem error.
 * @param roots - workspace root, policy additional roots and plugin roots.
 * @returns deduplicated physical roots, including the temp areas.
 */
export declare function collectWritableRoots(roots: WritableRoots): Promise<string[]>;
/** Options for {@link checkRedirectTarget}. */
export interface RedirectTargetOptions {
    /** The shell's starting directory (absolute when known). */
    readonly workdir: string;
    /** The writable areas a target may live in. */
    readonly roots: WritableRoots;
    /** Whether a relative target is acceptable: false when the call contains any
     * `cd`/`pushd`/`popd` (an earlier command could change the cwd first). */
    readonly allowRelative: boolean;
    /** Physical writable roots the caller already resolved; recomputed when absent. */
    readonly allowedRoots?: readonly string[];
}
/**
 * Validate one file redirect target.
 *
 * The lexical checks run first (literal, non-glob, non-tilde, relative only
 * when safe), then the physical checks: the parent directory must exist, the
 * resolved candidate must stay inside a writable root, and the final component
 * must not be a symbolic link (a dangling link would let the shell create the
 * link's target outside every root).
 * @param target - the quote-removed redirect target.
 * @param options - workdir, writable roots and the relative-target policy.
 * @returns the verdict, with a frozen reason code on refusal.
 */
export declare function checkRedirectTarget(target: string, options: RedirectTargetOptions): Promise<RedirectTargetCheck>;
