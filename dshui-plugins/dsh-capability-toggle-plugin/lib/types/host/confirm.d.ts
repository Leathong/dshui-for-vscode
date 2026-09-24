/**
 * The plugin-owned blocking confirmation channel.
 *
 * WHY THIS EXISTS (not the native `ask`/approval seam): a guard that returns
 * `{ kind: 'ask' }` is routed by the tool runtime through `approval.request()`,
 * whose `decide()` short-circuits to `'rejected'` the instant the session's
 * effective approval policy is `'never'` (the `danger-full-access` permission
 * preset) — BEFORE the `approval/request` waterfall is dispatched, so the
 * browser answerer is never consulted and NO prompt is shown. So this module
 * registers the confirmation itself, outside the approval policy.
 *
 * @module dsh-capability-toggle-plugin/host/confirm
 */
import type { GuardConfirmer } from './guards.ts';
export interface SseSink {
    /** Write one already-framed SSE chunk; false when the socket is gone. */
    write(chunk: string): boolean;
    end(): void;
}
export interface ConfirmPayload {
    readonly guardId: string;
    readonly guardAction: 'deny' | 'ask';
    readonly reason: string;
    readonly toolName: string;
    /** Full shell command, or JSON args bounded to {@link DETAIL_LIMIT}. */
    readonly detail: string;
}
export interface PendingConfirm extends ConfirmPayload {
    readonly id: string;
}
export type ConfirmOutcome = 'allow' | 'deny' | 'cancelled';
/**
 * Build the human detail for one guarded call.
 *
 * A shell command is returned VERBATIM: truncating it would hide a dangerous
 * suffix (a long heredoc whose final line is `rm -rf /`) from the user who is
 * being asked to approve that exact command. Non-shell arguments are bounded,
 * because a `write` call carries a whole file body that no card can show.
 */
export declare function buildConfirmDetail(toolName: string, args: Record<string, unknown>): string;
/**
 * Registry of live confirmations and their browser channels, keyed by session.
 * One instance per Host activation, shared by every agent binding and the HTTP
 * routes.
 */
export declare class ConfirmationCenter {
    private readonly channels;
    private readonly pending;
    private readonly disposers;
    private disposed;
    hasChannel(session: string): boolean;
    subscribe(session: string, sink: SseSink): () => void;
    /**
     * Register a blocking confirmation for a session. Resolves when a browser
     * answers, the caller's signal aborts, or the center is disposed; `cancelled`
     * covers both abort and dispose.
     */
    request(session: string, payload: ConfirmPayload, signal?: AbortSignal): Promise<ConfirmOutcome>;
    /** Answer one pending confirmation (first-wins); false if it never existed or already settled. */
    respond(session: string, id: string, decision: 'allow' | 'deny'): boolean;
    pendingFor(session: string): PendingConfirm[];
    get isDisposed(): boolean;
    /** Cancel every pending confirmation and end every sink; called on plugin unload. */
    dispose(): void;
    private broadcast;
    private push;
    private drop;
}
/**
 * Build the {@link GuardConfirmer} one agent binding hands to `applyGuards`.
 *
 * Returning `null` (no browser subscribed) means "fall back to the preset's
 * legacy decision" rather than blocking a headless turn forever. `deny` and
 * `cancelled` both map to `deny` so a cancellation can never read as consent,
 * and an already-disposed/aborted call denies outright instead of downgrading
 * to the legacy `ask` fallback — that downgrade would let a `never`-policy
 * session's blocked call slip through.
 */
export declare function makeGuardConfirmer(center: ConfirmationCenter, session: string): GuardConfirmer;
