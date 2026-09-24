/**
 * One live agent's enforcement binding. For a single agent it resolves the
 * effective disabled set (session over project over global over default-enabled)
 * and applies it to the agent's own scope across three seams:
 *
 *   - tools: `tools.restrict({ deny })` removes every disabled plain tool and
 *     every disabled MCP member tool (each MCP tool has its own switch, resolved
 *     member-over-server-group-over-off; see shared/resolve.ts) from the agent's
 *     inherited surface. A denied tool leaves the model schema set, so the next
 *     `request/header` snapshot no longer advertises it, and any call the model
 *     still attempts is refused by the restriction.
 *   - skills: for each disabled skill, `skills.register` installs a same-name
 *     runtime skill with `modelInvocable:false` in the agent's scope layer. The
 *     registry merges the agent layer after global (`merged.set` overwrites),
 *     so the stub shadows the real skill, and tool-skill's `isModelInvocable`
 *     filter then drops it from the `<available_skills>` catalog. Registering /
 *     disposing invalidates the skill catalog cache, so a mid-session toggle
 *     takes effect on the next agent step — no restart.
 *   - prompt: disabled plain tools shadow away their `tool:<name>` guidance
 *     section, and the curated prompt-gate family shadows sections/contexts or
 *     installs the runtime-context suppressor (see ./prompt.ts).
 *
 * Reconcile is latest-wins: any store change disposes the current application
 * and installs a fresh one from the current inventory and overrides.
 *
 * @module dsh-capability-toggle-plugin/host/agent-binding
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CapabilityDescriptor, CapabilityToggleProjection } from '../shared/types.ts';
import { type DriftSink } from './inventory.ts';
import type { ConfirmationCenter } from './confirm.ts';
import type { OverrideStore } from './store.ts';
/** Resolve the project key (absolute cwd) an agent's project level binds to. */
export declare function projectKeyOf(agent: Agent): string;
/**
 * One live agent's enforcement binding. Holds the agent identity plus the
 * disposers of the current application generation, and re-derives them on
 * demand. Not reused across agents.
 */
export declare class AgentBinding {
    private readonly store;
    private readonly agent;
    private readonly center?;
    private readonly onDrift?;
    private readonly scopeKey;
    /**
     * A context that inherits THIS plugin's `skills`/`tools` inject but carries
     * the agent's scope tag. Both seams read the caller's scope via
     * `scopeOf(this.ctx)` AND are gated by Cordis's per-fiber inject guard, so
     * `agent.ctx` cannot be used directly: its fiber does not inject `skills`, so
     * `agent.ctx.skills` throws "cannot get property skills without inject". This
     * scoped context passes the guard (host inject) while landing restrict() /
     * register() in the agent's own layer (agent scope tag).
     */
    private readonly scope;
    private readonly scopedCtx;
    readonly projectKey: string;
    readonly sessionKey: string;
    /** Disposers for the current application generation. */
    private disposers;
    /** Monotonic generation, so a slow reconcile cannot overwrite a newer one. */
    private generation;
    /**
     * The last PRISTINE inventory — captured inside reconcile's dispose window,
     * before our own enforcement is re-applied. Serving the UI from this cache is
     * mandatory: `tools.schemas(scope)` returns only the VISIBLE set (a denied
     * tool vanishes) and `skills.snapshot(scope)` returns the SHADOW's stub
     * description, so a live read while enforcement is applied would drop
     * toggled-off tools from the panel (making them impossible to re-enable) and
     * mislabel toggled-off skills. `null` until the first reconcile.
     */
    private lastInventory;
    /**
     * Per-guard hit counters for THIS agent, keyed by `guard:<name>` id. A guard
     * listener increments the count each time it denies/asks a call. This is
     * RUNTIME state, not persisted: it lives on the binding for the agent's
     * lifetime and is deliberately NOT cleared by `dispose()` (a reconcile that
     * reinstalls the listeners must not reset a running tally), only dropped when
     * the agent goes away with the binding. The projection reads it so the panel
     * can show "blocked N calls" per guard row.
     */
    private readonly guardHits;
    private readonly callHits;
    /**
     * @param store - the shared override store.
     * @param hostCtx - this plugin's context (injects `skills` and `tools`).
     * @param agent - the live agent this binding enforces.
     * @param center - the shared blocking-confirmation registry (optional, so a
     *   binding without one keeps the legacy deny/ask behavior).
     * @param onDrift - optional warn-once sink for unexpected framework shapes
     *   seen while reading this agent's inventory (threaded to `collectInventory`).
     */
    constructor(store: OverrideStore, hostCtx: Context, agent: Agent, center?: ConfirmationCenter | undefined, onDrift?: DriftSink | undefined);
    /**
     * The UI's inventory: the last pristine snapshot captured by reconcile. It
     * reflects the FULL capability set (nothing our own enforcement hid), which
     * is what the panel must render so a toggled-off tool stays listed and can be
     * turned back on. Triggers a reconcile when never yet populated.
     */
    inventory(): Promise<readonly CapabilityDescriptor[]>;
    /**
     * The last pristine inventory this binding captured, WITHOUT triggering a
     * reconcile — `null` when it has never reconciled. The registry reads it at
     * dispose time to seed its cross-lifetime fallback cache, so a panel reopened
     * after the agent goes idle can still render the persisted stances against a
     * known capability set (see ControllerRegistry.fallbackProjection). A plain
     * synchronous getter because dispose must not await a fresh scope read after
     * the agent's scope has begun tearing down.
     */
    get knownInventory(): readonly CapabilityDescriptor[] | null;
    /**
     * Read the agent's PRISTINE inventory — the full set with our own
     * enforcement lifted. Only valid to call while `this.disposers` is empty
     * (inside reconcile's dispose window); otherwise `tools.schemas` omits denied
     * tools and `skills.snapshot` returns shadow stubs.
     */
    private pristineInventory;
    /**
     * The set of switch ids resolved to disabled for this agent, over an
     * already-collected inventory. The MCP family is resolved per MEMBER tool
     * (member stance, then its server group's, then the opt-in `off` default), so
     * the returned set carries the member ids the tools seam denies — see
     * `disabledIdsForInventory`.
     * @param descriptors - this agent's inventory.
     * @returns the disabled switch ids.
     */
    disabledSet(descriptors: readonly CapabilityDescriptor[]): Set<string>;
    /**
     * Dispose the current application and install a fresh one from the current
     * inventory and overrides. Latest-wins: a reconcile started later always
     * ends up as the installed generation.
     */
    reconcile(): Promise<void>;
    /**
     * Install the guard-preset enforcement listener for this agent, synchronously.
     * Called at the head of reconcile (right after dispose, before any await) so a
     * safety guard has NO fail-open window: see the call site in {@link reconcile}.
     *
     * A guard's active set is `GUARD_IDS` intersected with the synchronous store
     * read — it never needs the pristine inventory the default-on seams await for,
     * so this stays await-free. Scope-only for the same reason as the approval
     * lock: the `tools/pre-execute` scope routing key is `exec.agent`, so a
     * scopeless listener would gate every agent; a scopeless binding installs no
     * guard. A single prepended listener runs the pure matcher and counts each hit
     * on the reconcile-surviving `guardHits` tally.
     */
    private installGuards;
    private installCallStats;
    /**
     * Build the UI projection for this agent: every capability with its per-level
     * stored stance and resolved disabled flag.
     * @param descriptors - this agent's inventory.
     * @returns the projection the composer panel renders.
     */
    projection(descriptors: readonly CapabilityDescriptor[]): CapabilityToggleProjection;
    /** The last pristine inventory this binding captured, or null before its first
     * reconcile. Exposed so the registry can retain it as a cross-lifetime cache:
     * a later read after the agent is disposed still has a capability set to
     * project the persisted overrides against. */
    cachedInventory(): readonly CapabilityDescriptor[] | null;
    /** Dispose the current application generation's registrations. */
    dispose(): void;
    /**
     * Full teardown when the agent goes away: drop the current registrations and
     * dispose the minted scope fiber. The agent's own scope teardown also unwinds
     * anything registered through it, so this is idempotent with that path.
     */
    destroy(): void;
}
