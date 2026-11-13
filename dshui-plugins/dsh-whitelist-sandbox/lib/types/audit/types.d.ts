/**
 * P1 audit decision types, shared by the analyzer, the failure hint and tests.
 * The reason codes are frozen by `docs/script-audit-spec.md`; do not rename
 * them without updating the spec and the hint renderer.
 */
/** Stable reason codes (see docs/script-audit-spec.md §6). */
export declare const AUDIT_REASON_CODES: readonly ["ok", "syntax:command-substitution", "syntax:backtick", "syntax:arithmetic", "syntax:process-substitution", "syntax:background", "syntax:function", "syntax:alias", "syntax:select", "syntax:coproc", "syntax:prefix-assignment", "syntax:sensitive-assignment", "syntax:param-operator", "syntax:unsupported", "syntax:unterminated-quote", "syntax:control-char", "syntax:empty-command", "syntax:redirect-form", "match:no-entry", "match:dynamic-command", "match:relative-command", "match:tilde-command", "match:denied-program", "match:empty-program", "match:absolute-not-writable", "match:absolute-model-writable", "redirect:outside", "redirect:parent-missing", "redirect:symlink", "redirect:relative-cwd", "redirect:dynamic", "redirect:glob", "redirect:tilde", "redirect:fs-error", "program:dynamic-exec", "program:environment", "program:forwarder"];
/** Union of the frozen reason codes. */
export type AuditReasonCode = typeof AUDIT_REASON_CODES[number];
/** One audit decision for a whole `bash -c` source. */
export interface AuditDecision {
    /** Whether the whole call may run outside the sandbox. */
    readonly exempt: boolean;
    /** Stable reason code (always `'ok'` when exempt). */
    readonly code: AuditReasonCode;
    /** Optional detail for the hint: command word, target, variable name, … */
    readonly detail?: string;
}
/** The command-word entry shape the audit consumes (see `CommandEntry`). */
export interface AuditEntry {
    readonly source: string;
    readonly tokens: readonly string[];
}
/** Everything the audit needs about one call. */
export interface AuditContext {
    /** Live operator entries (empty means nothing is exempt). */
    readonly entries: readonly AuditEntry[];
    /** The resolved shell starting directory (absolute when known). */
    readonly workdir: string;
    /** The call's sandbox policy workspace root. */
    readonly workspaceRoot: string;
    /** This plugin's extra writable roots (live). */
    readonly extraWritableRoots: readonly string[];
    /** Extra roots already present on the resolved sandbox policy, if any. */
    readonly additionalWritableRoots?: readonly string[];
}
