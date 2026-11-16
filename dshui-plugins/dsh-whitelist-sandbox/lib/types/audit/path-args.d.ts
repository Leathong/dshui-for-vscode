import type { AuditReasonCode } from './types.ts';
import type { Word } from './lexer.ts';
/** Every argument-path refusal code (frozen by docs/script-audit-spec.md §6). */
export type ArgumentPathCode = Extract<AuditReasonCode, `arg:${string}`>;
/** One argument-path refusal. */
export interface ArgumentPathFailure {
    readonly code: ArgumentPathCode;
    readonly detail?: string;
}
/** The verdict for one command's path arguments. */
export type ArgumentPathVerdict = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly failure: ArgumentPathFailure;
};
/** Options for {@link checkPathArguments}. */
export interface ArgumentPathOptions {
    /** The shell's starting directory (absolute when known). */
    readonly workdir: string;
    /** Whether a relative path is acceptable: false when the call mutates the cwd. */
    readonly allowRelative: boolean;
    /** Physical writable roots the write paths must stay inside. */
    readonly roots: readonly string[];
}
/**
 * Whether one command word names a modelled write utility (see {@link POLICIES}).
 * The analyzer uses this to decide whether an unwhitelisted command may still be
 * exempt through the write-path confinement alone.
 * @param name - the command word as written.
 * @returns true for the lowercased basename of a table entry.
 */
export declare function isModelledProgram(name: string): boolean;
/**
 * Check the write paths of one command word. Commands outside the closed table
 * are not inspected (they are the operator's explicit trust decision); modelled
 * commands must match a restricted shape and keep every write path inside the
 * physical writable roots.
 * @param words - the command's words (program first), quote-removed.
 * @param options - live workdir, cwd-mutator policy and physical writable roots.
 * @returns `{ ok: true }` when the invocation is exempt-safe, otherwise the
 *   first frozen `arg:*` refusal.
 */
export declare function checkPathArguments(words: readonly Word[], options: ArgumentPathOptions): Promise<ArgumentPathVerdict>;
