/**
 * The durable override store: one storage domain holding the global,
 * per-project, and per-session override maps, with typed reads, writes, and
 * change observation. Every write goes through the opened domain so the storage
 * layer owns durability and the `domain/changed` commit event; this module never
 * touches the backend medium directly.
 *
 * @module dsh-capability-toggle-plugin/host/store
 */
import type { Context } from '@deepseek-ai/cordis';
import type { LayeredOverrides, OverrideMap, ToggleLevel, ToggleState } from '../shared/types.ts';
import type { CapabilityToggleDomain, StoredDocument } from './config.ts';
/** The three level selectors a write addresses; project/session need a key. */
export type LevelSelector = {
    readonly level: 'global';
} | {
    readonly level: 'project';
    readonly key: string;
} | {
    readonly level: 'session';
    readonly key: string;
};
/**
 * Owns this plugin's opened storage domain and exposes level-aware reads and
 * writes. One instance per Host plugin activation.
 */
export declare class OverrideStore {
    private readonly ctx;
    private readonly domain;
    /**
     * @param ctx - the Host context, for the domain's change event.
     * @param domain - this plugin's already-opened storage domain.
     */
    constructor(ctx: Context, domain: CapabilityToggleDomain);
    /**
     * Observe committed changes to the stored document.
     * @param callback - invoked after each commit with the resolved next value.
     * @returns the disposer removing this observer.
     */
    watch(callback: (next: StoredDocument) => void): () => void;
    /** @returns the current resolved stored document. */
    read(): StoredDocument;
    /**
     * Assemble the three override maps that apply to one session in one project.
     * A missing project/session key contributes an empty map (all `inherit`).
     * @param projectKey - absolute project root, or `''` when none resolved.
     * @param sessionKey - the session id.
     * @returns the layered overrides for resolution.
     */
    layered(projectKey: string, sessionKey: string): LayeredOverrides;
    /**
     * Set one capability's stance at one level, persisting that level's map
     * through the domain. A `state` of `inherit` removes the stored key so the
     * level goes silent.
     * @param selector - which level (and key) to write.
     * @param id - capability switch key.
     * @param state - the new stance; `inherit` clears the stored entry.
     */
    set(selector: LevelSelector, id: string, state: ToggleState): Promise<void>;
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
    setMany(selector: LevelSelector, ids: readonly string[], state: ToggleState): Promise<void>;
    /** The table backing one keyed level. */
    private table;
    /**
     * Apply `transform` to one level's stored map and persist the result: the
     * global singleton for the global level, a table row for a keyed one.
     * @param selector - which level (and key) to write.
     * @param transform - maps the level's current override map to its next value.
     */
    private writeLevel;
}
/**
 * Produce the next override map after setting one id to one stance. An
 * `inherit` stance deletes the key; `on`/`off` store it.
 * @param map - the current stored map.
 * @param id - capability switch key.
 * @param state - the new stance.
 * @returns a new map (the input is not mutated).
 */
export declare function writeMap(map: OverrideMap, id: string, state: ToggleState): OverrideMap;
/**
 * The three levels a UI write may address, for input validation. Aliases the
 * shared priority order so the writable set and the resolution order can never
 * drift apart.
 */
export declare const WRITABLE_LEVELS: readonly ToggleLevel[];
