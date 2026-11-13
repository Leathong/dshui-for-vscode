/**
 * The single refusal type the P1 lexer, parser and analyzer throw: carrying the
 * frozen reason code plus an optional model-facing detail. `auditCommand` turns
 * it into an {@link AuditDecision}; nothing else in this directory catches it.
 */
import type { AuditReasonCode } from './types.ts';
/** A static-audit refusal: never exempt, with a frozen reason code. */
export declare class AuditError extends Error {
    /** The frozen reason code (see `docs/script-audit-spec.md` §6). */
    readonly code: AuditReasonCode;
    /** Optional detail: command word, target, variable name, … */
    readonly detail: string | undefined;
    constructor(code: AuditReasonCode, detail?: string);
}
/**
 * Throw one static-audit refusal.
 * @param code - frozen reason code.
 * @param detail - optional token/name the hint renderer can quote.
 */
export declare function fail(code: AuditReasonCode, detail?: string): never;
