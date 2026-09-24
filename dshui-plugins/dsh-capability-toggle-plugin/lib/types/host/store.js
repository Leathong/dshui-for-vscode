/**
 * The durable override store: one storage domain holding the global,
 * per-project, and per-session override maps, with typed reads, writes, and
 * change observation. Every write goes through the opened domain so the storage
 * layer owns durability and the `domain/changed` commit event; this module never
 * touches the backend medium directly.
 *
 * @module dsh-capability-toggle-plugin/host/store
 */
import { LEVEL_PRIORITY } from '../shared/resolve.js';
import { DOMAIN_NAME } from './config.js';
/**
 * Owns this plugin's opened storage domain and exposes level-aware reads and
 * writes. One instance per Host plugin activation.
 */
export class OverrideStore {
    ctx;
    domain;
    /**
     * @param ctx - the Host context, for the domain's change event.
     * @param domain - this plugin's already-opened storage domain.
     */
    constructor(ctx, domain) {
        this.ctx = ctx;
        this.domain = domain;
    }
    /**
     * Observe committed changes to the stored document.
     * @param callback - invoked after each commit with the resolved next value.
     * @returns the disposer removing this observer.
     */
    watch(callback) {
        return this.ctx.on('domain/changed', (change) => {
            if (change.domain !== DOMAIN_NAME)
                return;
            callback(this.read());
        });
    }
    /** @returns the current resolved stored document. */
    read() {
        return {
            global: this.domain.global.get(),
            projects: Object.fromEntries(this.table('projects').entries()),
            sessions: Object.fromEntries(this.table('sessions').entries()),
        };
    }
    /**
     * Assemble the three override maps that apply to one session in one project.
     * A missing project/session key contributes an empty map (all `inherit`).
     * @param projectKey - absolute project root, or `''` when none resolved.
     * @param sessionKey - the session id.
     * @returns the layered overrides for resolution.
     */
    layered(projectKey, sessionKey) {
        return {
            session: this.table('sessions').get(sessionKey) ?? {},
            project: projectKey === '' ? {} : (this.table('projects').get(projectKey) ?? {}),
            global: this.domain.global.get(),
        };
    }
    /**
     * Set one capability's stance at one level, persisting that level's map
     * through the domain. A `state` of `inherit` removes the stored key so the
     * level goes silent.
     * @param selector - which level (and key) to write.
     * @param id - capability switch key.
     * @param state - the new stance; `inherit` clears the stored entry.
     */
    async set(selector, id, state) {
        await this.writeLevel(selector, map => writeMap(map, id, state));
    }
    /**
     * Set several ids to the same stance at one level in a SINGLE domain write.
     * Equivalent to calling {@link set} once per id, but batched: one durable
     * write (one queue slot, one persist, one `domain/changed` broadcast) instead
     * of `ids.length` separate round trips through the domain's write chain. Used
     * by the panel's bulk toolbar action (enable-all / disable-all / clear-all on
     * a filtered tab), where an empty selection is a legal no-op.
     * @param selector - which level (and key) to write.
     * @param ids - the switch keys to set; duplicates are applied in order (the
     *   last occurrence of a given id wins, matching a sequential {@link set}).
     * @param state - the new stance for every id; `inherit` clears the stored entry.
     */
    async setMany(selector, ids, state) {
        if (ids.length === 0)
            return;
        await this.writeLevel(selector, map => {
            let next = map;
            for (const id of ids)
                next = writeMap(next, id, state);
            return next;
        });
    }
    /** The table backing one keyed level. */
    table(level) {
        return this.domain.table(level);
    }
    /**
     * Apply `transform` to one level's stored map and persist the result: the
     * global singleton for the global level, a table row for a keyed one.
     * @param selector - which level (and key) to write.
     * @param transform - maps the level's current override map to its next value.
     */
    async writeLevel(selector, transform) {
        if (selector.level === 'global') {
            await this.domain.global.set(transform(this.domain.global.get()));
            return;
        }
        const table = this.table(selector.level === 'project' ? 'projects' : 'sessions');
        const nextMap = transform(table.get(selector.key) ?? {});
        // Self-cleaning: a row whose map just went empty (every toggle reset to
        // `inherit`) is DELETED, not stored as `{}`. This is the ONLY reclaim path
        // for the `sessions` table — there is deliberately no `agent/disposed` hook
        // that prunes a session's stored overrides, because a session-level stance is
        // meant to survive a reload/restart of that session (dropping it when the
        // live agent goes away would defeat the level's purpose). The consequence is
        // a KNOWN, bounded monotonic growth: one small `{id: on|off}` row persists
        // per session that was ever toggled at session level and not later cleared —
        // a few bytes each, never touched on a hot path, only on an explicit user
        // write. It is not a runtime leak (nothing re-reads it into memory per
        // agent), and it self-heals whenever the user resets a session's toggles. If
        // a deployment ever accumulates enough dormant sessions to care, the fix is a
        // domain-level GC keyed on genuinely-ended sessions, not a dispose-time
        // delete here. Documented rather than "fixed" on purpose.
        if (Object.keys(nextMap).length === 0)
            await table.delete(selector.key);
        else
            await table.put(selector.key, nextMap);
    }
}
/**
 * Produce the next override map after setting one id to one stance. An
 * `inherit` stance deletes the key; `on`/`off` store it.
 * @param map - the current stored map.
 * @param id - capability switch key.
 * @param state - the new stance.
 * @returns a new map (the input is not mutated).
 */
export function writeMap(map, id, state) {
    const next = { ...map };
    if (state === 'inherit')
        delete next[id];
    else
        next[id] = state;
    return next;
}
/**
 * The three levels a UI write may address, for input validation. Aliases the
 * shared priority order so the writable set and the resolution order can never
 * drift apart.
 */
export const WRITABLE_LEVELS = LEVEL_PRIORITY;
