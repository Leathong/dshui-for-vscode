/**
 * Framework-contract self-check: the assumptions this plugin makes about the
 * DSH/Cordis surfaces it binds to, made observable.
 *
 * WHY THIS EXISTS. Every enforcement seam here is a silent-failure risk on a
 * framework upgrade: `ctx.on('tools/pre-execute', …)` registered against a
 * renamed (or re-routed) event does NOT throw — it installs a listener that is
 * simply never called, so a guard or the approval lock quietly stops matching
 * (fail-OPEN, the worst direction for a control). TypeScript catches a renamed
 * event only at the plugin's OWN compile; a host upgrade that ships new surfaces
 * while this plugin runs its already-built `lib/` gets no compile signal and no
 * runtime error. This module cannot re-add a compile check at runtime, but it
 * turns the invisible assumptions into (a) one startup line an operator can grep
 * when auditing an upgrade, and (b) warn-once drift alarms when a surface this
 * plugin reads returns a shape it did not expect.
 *
 * It changes NO enforcement behavior and adds no per-call cost: the banner logs
 * once at activation, and the drift alarms fire only off the shape checks the
 * inventory path already performs, deduped so a persistent drift cannot spam.
 *
 * @module dsh-capability-toggle-plugin/host/self-check
 */
import { DOMAIN_NAME } from './config.js';
export const SCOPE_IDENTITY_DRIFT_KEY = 'scope.identity';
export function scopeIdentityDrift(scopeKey) {
    if (scopeKey !== undefined)
        return null;
    return 'capability-toggle: this agent carries no dsh-scope tag, so per-agent enforcement is '
        + 'inoperative and the panel can only list globally registered capabilities (the skills tab '
        + 'collapses to global skills while tools, MCP groups and guards still look correct). '
        + 'dsh-agent-loop mints a scope for every agent, so a missing tag means the read went through '
        + 'a SECOND copy of @deepseek-ai/dsh-scope: scope identity is a module-private Symbol plus '
        + 'private WeakMaps, which a duplicate copy cannot read. Make the framework packages resolve '
        + "to the host's copy — declare every @deepseek-ai/* package as a peerDependency and keep a "
        + "second copy out of this plugin's own node_modules.";
}
/**
 * The framework contract this plugin depends on, in one place. Kept as data (not
 * scattered string literals) so the banner, the audit trail, and a future
 * compatibility test all read the SAME source of truth. Update this when a seam
 * moves — the banner then advertises the new assumption automatically.
 */
export const FRAMEWORK_CONTRACT = {
    /** Services whose absence makes the whole plugin fail to activate (via `inject`). */
    requiredServices: ['storageDomain', 'tools', 'skills', 'systemPrompt', 'webServer', 'connection'],
    /**
     * Members each required service must still expose. A surviving service NAME is
     * not enough: DSH 0.1.7 kept `settings` while dropping the method this plugin
     * called, so a presence-only probe reports a healthy host until the first write.
     */
    serviceShapes: { storageDomain: ['open'] },
    /** Services probed non-strictly; absence degrades one family, not the plugin. */
    optionalServices: ['approval'],
    /**
     * The enforcement events a scoped listener claims. A rename here turns a guard
     * or the approval lock into dead code with no runtime error — the single most
     * important line to check after a DSH upgrade.
     */
    enforcementEvents: ['tools/pre-execute', 'approval/request'],
    /**
     * The agent-lifecycle events this plugin tracks. `agent/created` mints a
     * binding; `agent/disposed` drops it (and its scope fiber + hit tally). The
     * disposed event is load-bearing for MEMORY: it is the only path that removes
     * a binding from the live map, so a rename/miss upstream would strand one
     * binding per agent that ever started — a slow leak with no runtime error.
     */
    lifecycleEvents: ['agent/created', 'agent/disposed'],
    /** The `Execution` field the pre-execute waterfall routes scope by. */
    scopeRoutingKey: 'exec.agent',
    /** The MCP public-tool name grammar the inventory groups servers by. */
    mcpNameGrammar: 'mcp__<server>__<tool>',
    /** The storage domain holding the three-level override document. */
    domainName: DOMAIN_NAME,
};
/**
 * Log one activation banner naming the framework assumptions enforcement rests
 * on. This is the anchor an operator greps when a guard or lock "stopped
 * working" after an upgrade: if a listed event or routing key was renamed
 * upstream, the seam fails silently, and this line is the record of what the
 * running build assumed. Logged at `info` once per activation.
 * @param ctx - the Host context, for its logger.
 */
export function emitContractBanner(ctx) {
    const c = FRAMEWORK_CONTRACT;
    ctx.logger.info(`active — enforcement binds events [${c.enforcementEvents.join(', ')}] `
        + `scoped by "${c.scopeRoutingKey}", groups MCP tools by "${c.mcpNameGrammar}", `
        + `tracks agent lifecycle via [${c.lifecycleEvents.join(', ')}], and persists stances in the `
        + `"${c.domainName}" storage domain. `
        + 'If a DSH upgrade renames an enforcement event, the affected guard/lock '
        + 'stops matching WITHOUT error (fail-open); if it renames "agent/disposed", '
        + 'per-agent bindings stop being reclaimed (slow memory leak). Grep this '
        + 'line when auditing an upgrade.');
}
/**
 * Verify each required service actually resolves AND still exposes the members
 * this plugin calls. `inject` already gates activation on resolution, so a miss
 * here means the inject contract itself changed (a required service was
 * renamed/removed upstream) — an `error`-level signal, not a mere warning,
 * because enforcement is then partially inoperative. Resolution alone cannot
 * see a service that kept its name and lost a method, which is exactly how the
 * 0.1.7 settings change presented.
 * @param ctx - the Host context.
 * @returns the names that failed to resolve or lost a required member (empty
 *   when every service is present and shaped as expected).
 */
export function checkRequiredServices(ctx) {
    const shapes = FRAMEWORK_CONTRACT.serviceShapes;
    const absent = [];
    const shapeless = [];
    for (const name of FRAMEWORK_CONTRACT.requiredServices) {
        const service = ctx.get(name, false);
        if (service === undefined) {
            absent.push(name);
            continue;
        }
        const members = shapes[name] ?? [];
        if (members.some(member => typeof service[member] !== 'function')) {
            shapeless.push(name);
        }
    }
    const failed = [...absent, ...shapeless];
    if (failed.length > 0) {
        const findings = [];
        if (absent.length > 0)
            findings.push(`absent despite inject: [${absent.join(', ')}]`);
        if (shapeless.length > 0)
            findings.push(`present but missing a member this plugin calls: [${shapeless.join(', ')}]`);
        ctx.logger.error(`required service(s) ${findings.join('; ')}. `
            + 'A DSH upgrade may have renamed or removed them; enforcement is degraded.');
    }
    return failed;
}
/**
 * Build a warn-once sink: the first message per key logs at `warn`, repeats are
 * dropped. Drift (a surface returning an unexpected shape) persists across every
 * reconcile, so an un-deduped warn would flood the log; the key lets one alarm
 * stand for a whole class of repeated drift.
 * @param ctx - the Host context, for its logger.
 * @returns a `(key, message)` sink that logs each distinct key once.
 */
export function makeWarnOnce(ctx) {
    const seen = new Set();
    return (key, message) => {
        if (seen.has(key))
            return;
        seen.add(key);
        ctx.logger.warn(message);
    };
}
