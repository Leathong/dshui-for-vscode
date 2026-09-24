/**
 * Guard presets: opt-in safety rules enforced at the `tools/pre-execute` seam.
 *
 * Unlike the skill/tool/mcp/approval families (which switch a whole capability
 * on or off), a guard inspects the ARGUMENTS of a pending call and decides per
 * call. This is the only seam that can express "bash is allowed, but not
 * `rm -rf`" or "writing is fine, but not to `.env`". `tools/pre-execute` is a
 * `Scoped<ToolRuntime>` waterfall returning a `PreToolDecision`:
 *   - `allow`        → run the call (our `next()`, i.e. no matching guard).
 *   - `deny{reason}` → materialize an error the model reads as a normal tool
 *                      failure carrying `reason`.
 *   - `ask{reason?}` → defer to the approval service: the call runs only on
 *                      `allowed-once`, otherwise denies (fail closed). This is
 *                      the pre-execute seam's NATIVE bridge to the same approval
 *                      waterfall the `approval` family gates — a dangerous call
 *                      becomes a human confirmation instead of a hard failure.
 *
 * OPT-IN, so the resolved default is OFF (see the `guard`-family fallback in
 * shared/resolve.ts): a freshly loaded plugin perturbs no agent until a user
 * turns a preset ON. Turning one ON tightens — direction uniform with the other
 * switches; only the default differs.
 *
 * SCOPE + ORDER: registration MUST go through the agent's scoped context. The
 * scope routing key for `tools/pre-execute` is `exec.agent`, so a scope-tagged
 * listener receives ONLY this agent's calls; a listener on the global layer
 * would gate EVERY agent (the caller gates on a real scope, exactly like the
 * approval seam and the prompt shadows). We register with `prepend: true` so a
 * decisive `deny`/`ask` is returned before any later-registered pre-execute
 * listener runs — the same ordering discipline the shipped `dsh-tool-jobs`
 * pre-execute listener uses.
 *
 * MATCHING IS A PURE FUNCTION (`evaluateGuards`): name + parsed arguments in, a
 * decision or null out. No `ctx`, no live agent — the whole matching core is
 * unit-tested directly. The listener is a thin scoped wrapper that counts hits
 * and returns the decision.
 *
 * @module dsh-capability-toggle-plugin/host/guards
 */
import type { Context } from '@deepseek-ai/cordis';
import type { PreToolDecision } from '@deepseek-ai/dsh-tools';
import type { CapabilityDescriptor } from '../shared/types.ts';
/** The `guard:<name>` id namespace, disjoint from skill/mcp/tool/prompt/approval. */
export declare function guardId(name: string): string;
export declare const SHELL_TOOLS: Set<string>;
/** The full guard id universe, for the resolver and projection. */
export declare const GUARD_IDS: readonly string[];
/**
 * The guard inventory rows. Guards are always offered (the `tools/pre-execute`
 * seam is core to the tool runtime, always present); their opt-in default is
 * expressed by the resolver fallback, not by hiding the rows.
 * @returns one descriptor per shipped preset, in evaluation order.
 */
export declare function collectGuards(): CapabilityDescriptor[];
/** One decisive guard match: the winning preset id and the decision it yields. */
export interface GuardHit {
    readonly id: string;
    readonly decision: Extract<PreToolDecision, {
        kind: 'deny' | 'ask';
    }>;
}
export interface GuardConfirmRequest {
    readonly toolName: string;
    readonly args: Record<string, unknown>;
    readonly hit: GuardHit;
    /** The guarded call's cancellation; an abort must settle the wait. */
    readonly signal: AbortSignal;
}
/**
 * Ask the user to decide one guard match, blocking the pre-execute waterfall.
 * Returning `null` means "no user channel available", which the caller turns
 * back into the hit's legacy decision — so this path can never widen what runs,
 * and a throw is treated as `deny`.
 */
export type GuardConfirmer = (req: GuardConfirmRequest) => Promise<'allow' | 'deny' | null>;
/**
 * Pure guard evaluation: the first active preset (deny presets first) whose
 * predicate matches a call decides it. No live agent, no ctx — the entire
 * matching core is exercised by unit tests through this function.
 * @param active - the guard ids resolved active for this agent.
 * @param name - the pending call's tool name.
 * @param args - the pending call's parsed arguments (any shape; coerced).
 * @returns the decisive hit, or null when no active preset matches (→ allow).
 */
export declare function evaluateGuards(active: ReadonlySet<string>, name: string, args: unknown): GuardHit | null;
/**
 * Install the guard enforcement listener on a scoped context when at least one
 * preset is active. A single scoped `tools/pre-execute` listener runs the pure
 * `evaluateGuards` over each call; a decisive match counts a hit (via `onHit`)
 * and returns its decision, otherwise the call passes through with `next()`.
 *
 * PREPEND: the decision must win over any later pre-execute listener, so we
 * register at the head. SCOPE: the caller passes the agent's scoped context and
 * only calls this with a real scope, so the listener is filtered to this agent.
 *
 * @param scopedCtx - the agent-scoped context (its scope tag filters dispatch).
 * @param active - the guard ids resolved active for this agent.
 * @param onHit - invoked with the preset id each time a call is denied/asked.
 * @param confirmer - optional blocking user-confirmation channel; when present,
 *   the user's answer wins over the preset's fixed action.
 * @returns a disposer array: one listener disposer when any guard is active,
 *   empty when none are (nothing installed).
 */
export declare function applyGuards(scopedCtx: Context, active: ReadonlySet<string>, onHit: (id: string) => void, confirmer?: GuardConfirmer): Array<() => void>;
