import type { AuditReasonCode } from './types.ts';
/** Which refusal code (and human category) one denied program belongs to. */
export interface DeniedProgram {
    /** Frozen reason code the analyzer reports for this program. */
    readonly code: AuditReasonCode;
    /** Coarse category, used to word the entry-validation error. */
    readonly kind: 'dynamic-exec' | 'environment' | 'alias' | 'forwarder';
}
/**
 * Classify a command word as a denied program. The comparison uses the
 * lowercased basename of the word, so `/bin/Bash` and `BASH` are caught on
 * case-insensitive filesystems too and an absolute path never bypasses the
 * check.
 * @param name - the command word as written.
 * @returns the refusal category, or undefined when the word is not denied.
 */
export declare function classifyDeniedProgram(name: string): DeniedProgram | undefined;
/**
 * Whether a command word names a program that can never be exempt, including
 * `printf` only when invoked with a `-v` variable-assignment option.
 * @param name - the command word as written.
 * @param args - the command's arguments (checked only for `printf`).
 * @returns true when the program is denied outright.
 */
export declare function isDeniedProgram(name: string, args?: readonly string[]): boolean;
/**
 * Why one denied program cannot be whitelisted (used by entry validation).
 * @param name - the command word as written.
 * @param denied - its classification.
 * @returns the operator-facing reason sentence.
 */
export declare function deniedProgramReason(name: string, denied: DeniedProgram): string;
/**
 * Whether one standalone assignment (or prefix assignment) targets a sensitive
 * variable. Names are case-sensitive, matching bash; `LD_*`/`DYLD_*` cover the
 * dynamic loader's whole namespace.
 * @param name - the variable name as written.
 * @returns true when assigning it must be refused.
 */
export declare function isSensitiveAssignmentName(name: string): boolean;
/**
 * Whether a bare, literal command word changes the shell's cwd (which makes a
 * relative redirect target unsafe later in the same call).
 * @param name - the command word (quotes already removed).
 * @returns true for `cd`, `pushd` and `popd`.
 */
export declare function isCwdMutator(name: string): boolean;
/** Shell reserved words: they are handled by the shell, never by a program,
 * so they can never be a whitelist entry. */
export declare const RESERVED_WORDS: ReadonlySet<string>;
