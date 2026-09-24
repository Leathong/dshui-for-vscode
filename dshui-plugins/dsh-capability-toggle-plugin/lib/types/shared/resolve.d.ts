/**
 * Pure resolution of layered capability overrides into an effective decision.
 * Shared by the Host (which applies the decision to the tool/skill seams) and
 * the browser panel (which shows the resolved fallback per row). No runtime
 * dependency on either half.
 *
 * @module dsh-capability-toggle-plugin/shared/resolve
 */
import type { CapabilityDescriptor, CapabilityKind, CapabilityToggleProjection, LayeredOverrides, OverrideMap, ToggleLevel, ToggleState } from './types.ts';
/**
 * Priority order applied on read: the first level with an explicit stance wins.
 * This is also the display and write order, so it is the single source of truth
 * the store (`WRITABLE_LEVELS`) and the panel (`levelsVisible`) both import — no
 * level list is spelled out a second time.
 */
export declare const LEVEL_PRIORITY: readonly ToggleLevel[];
export declare const CALLABLE_KINDS: readonly CapabilityKind[];
/**
 * Read one capability's stance at one level. A stored map omits `inherit`, so a
 * missing key resolves to `inherit`.
 * @param map - one level's override map.
 * @param id - capability switch key.
 * @returns the stored stance, or `inherit` when the level is silent.
 */
export declare function stanceAt(map: OverrideMap, id: string): ToggleState;
/**
 * Resolve the effective stance for one capability across all levels. Session
 * beats project beats global; a level that is `inherit` (or silent) falls
 * through. When every level is silent the `fallback` decides — `on` for the
 * capability families that are enabled by default (skill/mcp/tool/prompt/
 * approval), `off` for the opt-in `guard` family that starts inactive.
 * @param overrides - the three level maps.
 * @param id - capability switch key.
 * @param fallback - the stance when every level is silent (default `on`).
 * @returns the winning explicit stance, or `fallback` when none is set.
 */
export declare function resolveStance(overrides: LayeredOverrides, id: string, fallback?: Exclude<ToggleState, 'inherit'>): Exclude<ToggleState, 'inherit'>;
/**
 * Whether one capability of a DEFAULT-ON family resolves to disabled. Uses the
 * `on` fallback, so a silent capability is enabled and only an explicit merged
 * `off` disables it. Not for `guard` rows — those default off; use
 * {@link isGuardActive}.
 * @param overrides - the three level maps.
 * @param id - capability switch key.
 * @returns `true` when the merged decision is `off`.
 */
export declare function isDisabled(overrides: LayeredOverrides, id: string): boolean;
/**
 * Whether one `guard` preset resolves to ACTIVE. Uses the `off` fallback, so a
 * silent guard is inactive and only an explicit merged `on` activates it — the
 * opt-in direction that keeps freshly-installed guards from tightening every
 * agent until a user turns one on.
 * @param overrides - the three level maps.
 * @param id - guard switch key.
 * @returns `true` when the merged decision is `on`.
 */
export declare function isGuardActive(overrides: LayeredOverrides, id: string): boolean;
/**
 * The complete set of capability ids that resolve to disabled, across a known
 * id universe. Ids the caller does not list are not considered — a stored
 * stance for an id no longer present is inert until the id reappears.
 * @param overrides - the three level maps.
 * @param ids - the known switch keys to evaluate.
 * @returns the disabled ids, in the input order.
 */
export declare function disabledIds(overrides: LayeredOverrides, ids: readonly string[]): string[];
/**
 * Build the UI projection from an inventory and the layered overrides — the
 * pure core of the per-row transform. Shared by the live-agent binding (which
 * passes its per-agent guard-hit tally) and the no-live-agent fallback read
 * (which has no running tally, so guard rows report zero hits). Keeping this a
 * pure function is what lets the panel show persisted state even when no agent
 * is currently bound: the effect a row reports is `store.layered()` resolved
 * against a known inventory, independent of whether enforcement is applied
 * right now.
 *
 * A `guard` row is opt-in (default off): its resolved effect is ACTIVE
 * (`isGuardActive`, off fallback) and it carries a hit count. Every other
 * family is default-on: its effect is DISABLED (`isDisabled`, on fallback).
 * The two counters pair up by family: `hitCount` answers "did this safety rule
 * fire?" and rides only guard rows, while `callCount` answers "how much did the
 * model actually use this?" and rides only the callable families
 * ({@link CALLABLE_KINDS}) — `prompt` and `approval` rows are assembled or
 * consulted rather than called, so they carry neither. Both flags are always
 * present on the wire; only the one matching the kind is meaningful.
 *
 * @param descriptors - the full (pristine) capability inventory to render.
 * @param overrides - the three level maps resolved for this scope.
 * @param projectKey - the project root the project level binds to (`''` none).
 * @param guardHits - optional per-guard hit tally; absent → 0 for every guard.
 * @param callHits - optional per-capability call tally; absent → 0 for every
 *   callable row, the value an idle (no live agent) read reports.
 * @returns the projection the composer panel renders.
 */
export declare function buildProjection(descriptors: readonly CapabilityDescriptor[], overrides: LayeredOverrides, projectKey: string, guardHits?: ReadonlyMap<string, number>, callHits?: ReadonlyMap<string, number>): CapabilityToggleProjection;
