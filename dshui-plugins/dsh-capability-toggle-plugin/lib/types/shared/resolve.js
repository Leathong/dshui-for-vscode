/**
 * Pure resolution of layered capability overrides into an effective decision.
 * Shared by the Host (which applies the decision to the tool/skill seams) and
 * the browser panel (which shows the resolved fallback per row). No runtime
 * dependency on either half.
 *
 * @module dsh-capability-toggle-plugin/shared/resolve
 */
/**
 * Priority order applied on read: the first level with an explicit stance wins.
 * This is also the display and write order, so it is the single source of truth
 * the store (`WRITABLE_LEVELS`) and the panel (`levelsVisible`) both import — no
 * level list is spelled out a second time.
 */
export const LEVEL_PRIORITY = ['session', 'project', 'global'];
export const CALLABLE_KINDS = ['skill', 'mcp', 'tool'];
/**
 * Read one capability's stance at one level. A stored map omits `inherit`, so a
 * missing key resolves to `inherit`.
 * @param map - one level's override map.
 * @param id - capability switch key.
 * @returns the stored stance, or `inherit` when the level is silent.
 */
export function stanceAt(map, id) {
    // Read own properties only. A bare `map[id]` walks the prototype chain, so an
    // id like `constructor`/`toString`/`__proto__` would resolve to an inherited
    // function and defeat the `?? 'inherit'` fallback, letting a non-stance value
    // flow into resolveStance as if it were an explicit `on`/`off`. Ids come from
    // the inventory and (for writes) HTTP input, so treat the map as a plain
    // lookup table: a key that is not an own property is simply `inherit`.
    if (!Object.prototype.hasOwnProperty.call(map, id))
        return 'inherit';
    return map[id] ?? 'inherit';
}
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
export function resolveStance(overrides, id, fallback = 'on') {
    for (const level of LEVEL_PRIORITY) {
        // Tolerate a missing level map (partial construction / incomplete
        // deserialization): a silent level is `inherit`, same as an empty map.
        const stance = stanceAt(overrides[level] ?? {}, id);
        if (stance !== 'inherit')
            return stance;
    }
    return fallback;
}
/**
 * Whether one capability of a DEFAULT-ON family resolves to disabled. Uses the
 * `on` fallback, so a silent capability is enabled and only an explicit merged
 * `off` disables it. Not for `guard` rows — those default off; use
 * {@link isGuardActive}.
 * @param overrides - the three level maps.
 * @param id - capability switch key.
 * @returns `true` when the merged decision is `off`.
 */
export function isDisabled(overrides, id) {
    return resolveStance(overrides, id, 'on') === 'off';
}
/**
 * Whether one `guard` preset resolves to ACTIVE. Uses the `off` fallback, so a
 * silent guard is inactive and only an explicit merged `on` activates it — the
 * opt-in direction that keeps freshly-installed guards from tightening every
 * agent until a user turns one on.
 * @param overrides - the three level maps.
 * @param id - guard switch key.
 * @returns `true` when the merged decision is `on`.
 */
export function isGuardActive(overrides, id) {
    return resolveStance(overrides, id, 'off') === 'on';
}
/**
 * Resolve one MCP member tool's effective stance. MCP tools are the second
 * OPT-IN family (after `guard`): a member resolves from the FIRST level that
 * says something, where its OWN stance at that level beats its server group's,
 * and a level silent for both falls through. When every level is silent for
 * both, the answer is `off` — the plugin's "every MCP tool starts disabled,
 * enable what you need" default.
 *
 * The group's stance is therefore a DEFAULT for its members, not an override of
 * them: `mcp:<server>` ON enables every member that has not been set OFF at the
 * same or a nearer level (one gesture for a whole server), and a member's own
 * `on` at a level beats a group `off` at the SAME level — the more specific
 * statement wins. To keep a whole server silent, leave the members unset here or
 * clear them, rather than relying on the group alone.
 * @param overrides - the three level maps.
 * @param memberId - the member's `mcptool:<server>/<rest>` switch key.
 * @param groupId - the server's `mcp:<server>` switch key.
 * @returns the winning explicit stance, or `off` when nothing is set.
 */
export function mcpMemberStance(overrides, memberId, groupId) {
    for (const level of LEVEL_PRIORITY) {
        // Tolerate a missing level map, like resolveStance does.
        const map = overrides[level] ?? {};
        const own = stanceAt(map, memberId);
        if (own !== 'inherit')
            return own;
        const group = stanceAt(map, groupId);
        if (group !== 'inherit')
            return group;
    }
    return 'off';
}
/**
 * Whether one MCP member tool resolves to disabled. `true` unless the member —
 * or its server group at a level the member leaves silent — says `on`, since an
 * MCP tool defaults to off.
 * @param overrides - the three level maps.
 * @param memberId - the member's switch key.
 * @param groupId - the server's switch key.
 * @returns `true` when the tool is denied.
 */
export function isMcpMemberDisabled(overrides, memberId, groupId) {
    return mcpMemberStance(overrides, memberId, groupId) === 'off';
}
/**
 * The complete set of capability ids that resolve to disabled, across a known
 * id universe. Ids the caller does not list are not considered — a stored
 * stance for an id no longer present is inert until the id reappears.
 * @param overrides - the three level maps.
 * @param ids - the known switch keys to evaluate.
 * @returns the disabled ids, in the input order.
 */
export function disabledIds(overrides, ids) {
    return ids.filter(id => isDisabled(overrides, id));
}
/**
 * The complete set of switch ids that resolve to disabled across one INVENTORY:
 * the id universe an agent's enforcement is applied against. Unlike
 * {@link disabledIds} (a flat default-on evaluation over a list of ids), this
 * walks the descriptor tree so the two families whose default is not "enabled"
 * are read against their own rule:
 *
 *   - `mcp`: a member tool resolves through {@link isMcpMemberDisabled}
 *     (member stances, then its server group's, then the opt-in `off` default),
 *     so its MEMBER id — not the group id — is what the tools seam denies. The
 *     group id is additionally reported when NOT ONE member is enabled, which is
 *     the group row's "this whole server is off" reading; the tools seam ignores
 *     it (see `deniedToolNames`).
 *   - every other family (skill/tool/prompt/approval/guard): the flat
 *     default-on {@link isDisabled} read, unchanged. A `guard` id listed here
 *     is inert for the tool/skill seams; guards are enforced by their own
 *     pre-execute listener (see `AgentBinding.installGuards`).
 * @param descriptors - the inventory to resolve against.
 * @param overrides - the three level maps.
 * @returns the disabled switch ids, in inventory order.
 */
export function disabledIdsForInventory(descriptors, overrides) {
    const out = [];
    for (const d of descriptors) {
        if (d.kind === 'mcp') {
            const members = d.memberTools ?? [];
            let anyEnabled = false;
            for (const m of members) {
                if (isMcpMemberDisabled(overrides, m.id, d.id))
                    out.push(m.id);
                else
                    anyEnabled = true;
            }
            if (!anyEnabled)
                out.push(d.id);
            continue;
        }
        if (isDisabled(overrides, d.id))
            out.push(d.id);
    }
    return out;
}
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
 * Three default directions ride this one transform, each read against its own
 * family default:
 *   - `guard` is opt-in: its resolved effect is ACTIVE (`isGuardActive`, off
 *     fallback) and it carries a hit count.
 *   - an `mcp` group row carries its member tools as RESOLVED member rows, each
 *     opt-in too (`isMcpMemberDisabled`: `off` unless the member or its server
 *     says `on`). The group's own effect is "not one member is callable", so the
 *     server row dims exactly when it offers the model nothing.
 *   - every other family is default-on: its effect is DISABLED (`isDisabled`,
 *     on fallback).
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
export function buildProjection(descriptors, overrides, projectKey, guardHits, callHits) {
    const rows = descriptors.map((d) => {
        const levels = {
            session: stanceAt(overrides.session, d.id),
            project: stanceAt(overrides.project, d.id),
            global: stanceAt(overrides.global, d.id),
        };
        // `memberTools` is lifted out of the descriptor before it is spread into a
        // row: a descriptor carries the pristine member IDENTITY, while a row must
        // carry RESOLVED member rows (each with its own stances and effect), so the
        // two are deliberately different types and only the `mcp` branch below may
        // put members on a row.
        const { memberTools, ...base } = d;
        if (d.kind === 'guard') {
            return {
                ...base, levels,
                disabled: isGuardActive(overrides, d.id),
                hitCount: guardHits?.get(d.id) ?? 0,
            };
        }
        if (d.kind === 'mcp') {
            // Member rows resolve one by one, so the panel can offer a switch per
            // tool. A member's `levels` are its OWN stored stances (the group's are
            // shown on the group row); its `disabled` is the full member-then-group
            // resolution, which is what the badge and the enforcement both read.
            const members = (memberTools ?? []).map((m) => ({
                ...m,
                levels: {
                    session: stanceAt(overrides.session, m.id),
                    project: stanceAt(overrides.project, m.id),
                    global: stanceAt(overrides.global, m.id),
                },
                disabled: isMcpMemberDisabled(overrides, m.id, d.id),
                callCount: callHits?.get(m.id) ?? 0,
            }));
            // The server row's tally is its members' sum: calls are attributed to the
            // member switch, so the group id itself never collects one. A descriptor
            // with no members (a hand-built fixture) falls back to the group id.
            const callCount = members.length > 0
                ? members.reduce((sum, m) => sum + (m.callCount ?? 0), 0)
                : (callHits?.get(d.id) ?? 0);
            return {
                ...base, levels, memberTools: members, callCount,
                disabled: !members.some(m => !m.disabled),
            };
        }
        if (CALLABLE_KINDS.includes(d.kind)) {
            return { ...base, levels, disabled: isDisabled(overrides, d.id), callCount: callHits?.get(d.id) ?? 0 };
        }
        return { ...base, levels, disabled: isDisabled(overrides, d.id) };
    });
    return { rows, projectKey };
}
