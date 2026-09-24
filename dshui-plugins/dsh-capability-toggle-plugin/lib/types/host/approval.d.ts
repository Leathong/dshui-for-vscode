/**
 * Approval-policy capability family: a single switch that locks one agent's
 * approval requests to a deterministic rejection, without touching the
 * deployment's shared approval-policy state.
 *
 * WHY A DEDICATED SEAM (not `approval.setPolicy`):
 * DSH already ships a first-class permission UI (`dsh-permission-presets` +
 * `dsh-client-ui-permission-presets`: the `/permission` command, the composer
 * chip, the Settings row) that OWNS the session's approval policy. It writes a
 * durable `approval/policy` session-log event AND injects a model message
 * ("the approval policy changed…"). `ApprovalService.setPolicy` does the same.
 * If this plugin also called `setPolicy`, its reconcile would repeatedly
 * overwrite the user's `/permission` choice on the ONE shared policy value —
 * two controllers fighting over one piece of log-folded state, last-write-wins.
 *
 * Instead we gate the SAME seam the policy consults, one layer earlier and
 * scoped to this agent only: `approval/request` is a `Scoped<ApprovalService>`
 * waterfall. A scope-tagged listener (registered through the agent's scoped
 * context) receives ONLY that agent's requests. When the switch is off we claim
 * the request with `'rejected'`; when on we `next()` to delegate to whatever
 * the deployment composed (the real answerers, or the policy's own decision).
 *
 * Properties this buys us:
 *   - Clean disposer, exactly like `tools.restrict`: reconcile installs the
 *     listener when disabled and disposes it when re-enabled — no state to
 *     unwind, no log event, no injected message.
 *   - No collision with `dsh-permission-presets`: we never write
 *     `approval/policy`; the user's `/permission` value is read-through
 *     untouched by our `next()`.
 *   - Scope-isolated: only the bound agent is affected. A same-name listener on
 *     the GLOBAL layer (no scope) would intercept EVERY agent, so enforcement
 *     is gated on a real scope, exactly like the prompt shadows.
 *
 * SEMANTICS (direction matches the other switches — off = tighten/lock):
 *   - on / inherit  → normal: delegate via `next()` (answerers or session policy).
 *   - off           → locked: every approval request for this agent resolves
 *                     `'rejected'` (no interactive escalation, no sandbox
 *                     elevation). The model still sees a normal rejected tool
 *                     result — the audit pair the service always logs remains
 *                     the record of the decision.
 *
 * OPTIONAL SERVICE: not every deployment loads `dsh-user-approval`, so the
 * `approval` service is NOT in the plugin's `inject` list (that would block the
 * whole plugin from loading where approval is absent). Presence is probed with
 * `ctx.get('approval', false)`; when absent, no row is offered and no listener
 * is registered — the family simply does not exist for that deployment.
 *
 * @module dsh-capability-toggle-plugin/host/approval
 */
import type { Context } from '@deepseek-ai/cordis';
import type { CapabilityDescriptor } from '../shared/types.ts';
/**
 * The sole approval-family switch id. Like `prompt:runtime` it is an
 * intentionally bare singleton: it gates one all-or-nothing behavior (lock this
 * agent's approvals), so it carries no `<name>` segment. The `:policy` suffix
 * reads as "the approval policy gate" and keeps it clear of the `approval/…`
 * event namespace.
 */
export declare const APPROVAL_GATE_ID = "approval:policy";
/**
 * The approval-family inventory: one row when the approval service is present,
 * none otherwise. Pure read — registers nothing.
 * @param ctx - a context whose service presence reflects the deployment.
 * @returns a single-element array, or an empty array when approval is absent.
 */
export declare function collectApprovalGate(ctx: Context): CapabilityDescriptor[];
/**
 * Install the approval lock on a scoped context when the gate is disabled.
 *
 * Registration MUST go through a context carrying the agent's scope tag so the
 * `approval/request` listener is filtered to this agent only. The caller (the
 * agent binding) guarantees this by passing its `scopedCtx`, and by only
 * calling this when the agent has a real scope — a listener registered on the
 * global layer would intercept every agent's approvals.
 *
 * @param scopedCtx - the agent-scoped context (its scope tag filters dispatch).
 * @param disabled - the switch ids resolved to disabled for this agent.
 * @returns a disposer array: one entry that removes the listener when the gate
 *   is disabled, empty when it is on (nothing installed).
 */
export declare function applyApprovalGate(scopedCtx: Context, disabled: ReadonlySet<string>): Array<() => void>;
