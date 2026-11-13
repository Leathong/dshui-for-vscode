/**
 * Failure hint renderer: turn one P1 audit decision into a short, actionable
 * note appended to a sandbox-denied bash result.
 *
 * The hint never changes the decision, never grants anything, and never
 * auto-escalates: it only tells the model why the call was not exempt and the
 * two sanctioned ways forward (rewrite into the subset, or ask the user for a
 * one-call `danger-full-access` approval).
 */
import type { AuditDecision } from './audit/types.ts';
/** Options for {@link renderAuditHint}. */
export interface HintOptions {
    /** Append the one-call escalation alternative (the bash tool advertises it). */
    readonly escalation?: boolean;
}
/**
 * Render the denial hint for one refusal decision.
 * @param decision - the audit decision for the call that was denied.
 * @param options - escalation availability.
 * @returns a 2–3 line hint, or undefined when the decision is exempt.
 */
export declare function renderAuditHint(decision: AuditDecision, options?: HintOptions): string | undefined;
