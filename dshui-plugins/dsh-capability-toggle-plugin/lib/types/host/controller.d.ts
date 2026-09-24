/**
 * Registry of live agent bindings: one `AgentBinding` per live agent, tracked
 * across `agent/created` and `agent/disposed`. The per-agent enforcement
 * mechanics live in ./agent-binding.ts; this module only owns the lifecycle map
 * and the fan-out reconcile a store commit triggers.
 *
 * @module dsh-capability-toggle-plugin/host/controller
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CapabilityToggleProjection } from '../shared/types.ts';
import { AgentBinding } from './agent-binding.ts';
import type { ConfirmationCenter } from './confirm.ts';
import type { DriftSink } from './inventory.ts';
import type { OverrideStore } from './store.ts';
export { AgentBinding, projectKeyOf } from './agent-binding.ts';
/**
 * Registry of live agent bindings. One per Host activation; agents come and go
 * through `agent/created` and `agent/disposed`.
 */
export declare class ControllerRegistry {
    private readonly store;
    private readonly hostCtx;
    private readonly center?;
    private readonly onDrift?;
    private readonly bindings;
    /**
     * Last-known inventory per session id, surviving the live binding's disposal.
     * Bounded by distinct session ids seen this Host activation (a few per user
     * session); entries are overwritten on each dispose and never grow per turn.
     * Read only by the no-live-agent fallback read.
     */
    private readonly lastKnown;
    /**
     * @param store - the shared override store.
     * @param hostCtx - this plugin's context, whose `skills`/`tools` inject each
     *   binding borrows through a scope minted onto the agent's scope key.
     * @param center - the shared blocking-confirmation registry (optional).
     * @param onDrift - optional warn-once sink handed to every binding's inventory
     *   read, so an unexpected framework shape alarms once instead of silently
     *   yielding an empty capability list.
     */
    constructor(store: OverrideStore, hostCtx: Context, center?: ConfirmationCenter | undefined, onDrift?: DriftSink | undefined);
    /**
     * Track a newly started agent and apply the current decision to it.
     * @param agent - the agent that just started its session.
     * @returns the created binding.
     */
    add(agent: Agent): Promise<AgentBinding>;
    /**
     * Stop tracking an agent and drop its application (and its minted scope).
     * @param sessionId - the disposed agent's session id.
     */
    remove(sessionId: string): void;
    /**
     * Look up one live agent's binding.
     * @param sessionId - the session id.
     * @returns the binding, or undefined when the agent is not tracked.
     */
    get(sessionId: string): AgentBinding | undefined;
    /**
     * Build a projection for a session that has NO live binding, from its
     * last-known inventory resolved against the CURRENT store. This is what lets
     * the panel show persisted stances after the agent goes idle (an agent's
     * `agent/disposed` drops the live binding every turn). Returns undefined only
     * when this session was never seen live this activation — the caller then
     * answers "no agent" rather than a misleading empty panel. Guard hit tallies
     * are per-agent runtime state that does not survive disposal, so guard rows
     * report zero hits here (their on/off effect is still resolved correctly).
     * @param sessionId - the session id.
     * @returns the fallback projection, or undefined when nothing is cached.
     */
    fallbackProjection(sessionId: string): CapabilityToggleProjection | undefined;
    /**
     * The project root a disposed session's project level binds to, from its
     * last-known snapshot. Lets an idle-time (no live binding) project-level
     * write resolve its selector key without a live agent. Returns undefined when
     * this session was never seen live this activation, in which case a
     * project-level write cannot be placed (the caller answers 409/404).
     * @param sessionId - the session id.
     * @returns the cached project key, or undefined when nothing is cached.
     */
    lastKnownProjectKey(sessionId: string): string | undefined;
    /** Re-apply the current decision to every tracked agent (store changed). */
    reconcileAll(): Promise<void>;
}
