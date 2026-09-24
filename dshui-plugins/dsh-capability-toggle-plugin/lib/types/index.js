/**
 * Host (Node) half of dsh-capability-toggle-plugin.
 *
 * Lets a user switch off individual skills, MCP server groups, and plain tools
 * at three levels — session, project, and global — from a panel in the composer
 * tool row. A switched-off capability disappears from the model's tool schema
 * set / skill catalog on the next agent step and is hard-refused if the model
 * still attempts it, so the effect is enforced, not merely hidden.
 *
 * Composition:
 *   - OverrideStore        durable three-level state in one storage domain.
 *   - ControllerRegistry   per-agent enforcement on the tool and skill seams.
 *   - installHttp          the browser panel's read/write channel.
 *
 * Enforcement is re-applied whenever the store commits (any level, any client)
 * and whenever an agent starts; it is dropped when an agent is disposed.
 *
 * @module dsh-capability-toggle-plugin
 */
import { CapabilityToggleSpec } from './host/config.js';
import { OverrideStore } from './host/store.js';
import { ControllerRegistry } from './host/controller.js';
import { installHttp } from './host/http.js';
import { ConfirmationCenter } from './host/confirm.js';
import { checkRequiredServices, emitContractBanner, makeWarnOnce } from './host/self-check.js';
/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-capability-toggle-plugin';
/**
 * Required services. `storageDomain` backs the durable state, `tools` and
 * `skills` are the enforced seams, `systemPrompt` carries the tool-guidance
 * section shadow that accompanies a disabled tool, `webServer` carries the
 * browser panel channel, and `connection` carries the per-request auth seam the
 * panel routes apply themselves.
 */
export const inject = ['storageDomain', 'tools', 'skills', 'systemPrompt', 'webServer', 'connection'];
/**
 * Host plugin body. Every contribution is an effect, so plugin unload (or HMR
 * hot-swap) tears down the routes, the domain, and every per-agent application.
 * The domain is opened BEFORE any listener is installed: a binding created
 * against a not-yet-open domain would read empty overrides and fail open.
 * @param ctx - the Host root context.
 */
export async function apply(ctx) {
    // One-time contract audit: name the framework assumptions enforcement rests on
    // (so an upgrade regression is greppable) and confirm the injected services
    // actually resolved (a miss means the inject contract itself moved upstream).
    emitContractBanner(ctx);
    checkRequiredServices(ctx);
    // Warn-once sink for framework-shape drift surfaced while reading the tool /
    // skill inventory. Shared across every agent's reconcile so a persistent drift
    // alarms once, not once per agent per store commit.
    const onDrift = makeWarnOnce(ctx);
    // A domain medium this plugin cannot read (a foreign file at the unit path, an
    // unreadable record, a version mismatch) fails activation rather than
    // enforcing against a half-read document — deliberately, because enforcing the
    // wrong stances is worse for a security control than being absent. The log
    // line names the cause so the missing panel is diagnosable.
    let domain;
    try {
        domain = await ctx.storageDomain.open(CapabilityToggleSpec);
    }
    catch (error) {
        ctx.logger.error(`capability-toggle could not open its storage domain '${CapabilityToggleSpec.name}': `
            + `${messageOf(error)}. Neither the panel nor any switch is available until that medium is readable.`);
        throw error;
    }
    // The disposer must RETURN the close promise: cordis awaits async effect
    // disposers before the fiber unloads, and the facility refuses a same-name
    // open while the previous one is still closing — a fire-and-forget close makes
    // a reload or re-apply fail with "already open".
    ctx.effect(() => () => domain.close(), 'capability-toggle: storage domain');
    const store = new OverrideStore(ctx, domain);
    const center = new ConfirmationCenter();
    const registry = new ControllerRegistry(store, ctx, center, onDrift);
    ctx.effect(() => installHttp(ctx, store, registry, center), 'capability-toggle: http routes');
    ctx.effect(() => () => center.dispose(), 'capability-toggle: confirmation center');
    // A committed change at any level (from any client) re-applies enforcement to
    // every live agent. The observer disposer is returned into the effect.
    ctx.effect(() => store.watch(() => {
        void registry.reconcileAll().catch((error) => {
            ctx.logger.warn(`capability-toggle reconcile failed: ${messageOf(error)}`);
        });
    }), 'capability-toggle: domain observer');
    // Track each agent for its whole lifetime. `agent/created` is the 0.1.7 name
    // for what `agent/session-start` signalled, and the rename is SILENT: cordis
    // accepts a listener for an unknown event name and never calls it, so a stale
    // name leaves every switch unenforced with no error. The listener must stay
    // synchronous and non-throwing — `agent/created` is serial, so its rejection
    // would fail agent creation.
    ctx.on('agent/created', ({ agent }) => {
        void registry.add(agent).catch((error) => {
            ctx.logger.warn(`capability-toggle failed to bind agent: ${messageOf(error)}`);
        });
    });
    ctx.on('agent/disposed', ({ agent }) => {
        registry.remove(agent.session.id);
    });
}
/** Extract a log-safe message from an unknown error. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
