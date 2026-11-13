import type { AuditContext, AuditDecision } from './types.ts';
/**
 * Audit one `bash -c` source against the operator whitelist and writable roots.
 * @param command - the exact source the bash tool was asked to run.
 * @param context - live entries, resolved workdir and writable roots.
 * @returns `{ exempt: true, code: 'ok' }` only when the whole call satisfies the
 *   spec; otherwise the first refusal with its frozen reason code.
 */
export declare function auditCommand(command: string, context: AuditContext): Promise<AuditDecision>;
