/**
 * Capability inventory: enumerate the switchable skills, MCP servers (with one
 * switch per member tool), and plain tools visible to one agent scope, as the
 * descriptor rows the UI lists and the id universe the resolver evaluates
 * against.
 *
 * Three kinds, three sources:
 *   - `skill`: `ctx.skills.snapshot({ scope })` — every model-invocable skill
 *     summary (name + routing description).
 *   - `mcp`:   tools named `mcp__<server>__<rawName>` (the mcp-client public
 *     name grammar), grouped by `<server>` into one group row that carries its
 *     member tools. Each member gets its OWN switch, and the group's `mcp:<server>`
 *     switch is the members' default (see shared/resolve.ts `mcpMemberStance`):
 *     MCP tools are opt-in, so a member with nothing set anywhere is disabled.
 *   - `tool`:  every other model-facing tool from `ctx.tools.schemas(scope)`.
 *
 * The switch id namespaces are disjoint: `skill:<name>`, `mcp:<server>`,
 * `mcptool:<server>/<rest>`, `tool:<name>`. This keeps one flat OverrideMap
 * unambiguous across kinds.
 *
 * @module dsh-capability-toggle-plugin/host/inventory
 */
import { collectPromptGates } from './prompt.js';
import { collectApprovalGate } from './approval.js';
import { collectGuards } from './guards.js';
/** Prefix marking an MCP public tool name; capture group 1 is the server. */
const MCP_NAME = /^mcp__([A-Za-z0-9_-]{1,32})__/;
const SKILL_TOOL_NAME = 'skill';
/** Build the `skill:<name>` switch id. */
export function skillId(name) {
    return `skill:${name}`;
}
/** Build the `mcp:<server>` switch id. */
export function mcpId(server) {
    return `mcp:${server}`;
}
/**
 * Build the `mcptool:<server>/<rawName>` switch id for ONE member tool of a
 * server, where `rawName` is the public name after `mcp__<server>__`. Distinct
 * from {@link mcpId}: the group id is the member's default, the member id is the
 * tool's own switch.
 */
export function mcpToolId(server, rawName) {
    return `mcptool:${server}/${rawName}`;
}
/** Build the `tool:<name>` switch id. */
export function toolId(name) {
    return `tool:${name}`;
}
/**
 * Attribute one model tool call to the switch id whose row should count it.
 * An MCP call counts on its MEMBER switch (`mcptool:<server>/<rest>`), so the
 * per-tool rows carry their own usage and the server row shows the sum; skills
 * count on the invoked skill (the loader tool's argument), not on `skill`; every
 * other tool counts on its own `tool:<name>` row.
 * @param name - the model-facing tool name that ran.
 * @param args - that call's arguments (used only for the skill loader).
 * @returns the switch id to credit, or undefined when nothing should be.
 */
export function attributeCall(name, args) {
    if (name === SKILL_TOOL_NAME) {
        const skillName = args?.name;
        return typeof skillName === 'string' && skillName !== '' ? skillId(skillName) : undefined;
    }
    const mcp = MCP_NAME.exec(name);
    return mcp !== null
        ? mcpToolId(mcp[1], name.slice(mcp[0].length))
        : toolId(name);
}
/**
 * Enumerate every switchable capability for one agent scope. Pure read: it
 * registers nothing and mutates no state.
 * @param ctx - a context that can read `skills` and `tools`.
 * @param scope - the agent scope key to view, or undefined for the global view.
 * @param cwd - the agent's session cwd, so project-level skill roots
 *   (`<projectRoot>/.dsh/skills`, `<projectRoot>/.agents/skills`) are
 *   discovered; omitted (or `''`) yields only the user/bundled roots.
 * @param onDrift - optional warn-once sink for unexpected framework shapes.
 * @returns descriptors in tab order (skills, then mcps, then tools), each tab
 *   sorted by name.
 */
export async function collectInventory(ctx, scope, cwd, onDrift) {
    const skills = await collectSkills(ctx, scope, cwd, onDrift);
    const { mcps, tools } = collectTools(ctx, scope, onDrift);
    const prompts = await collectPromptGates(ctx, scope);
    const approval = collectApprovalGate(ctx);
    const guards = collectGuards();
    return [...skills, ...mcps, ...tools, ...prompts, ...approval, ...guards];
}
/** Skill rows: one per model-invocable skill, sorted by name. */
async function collectSkills(ctx, scope, cwd, onDrift) {
    const options = {};
    if (scope !== undefined)
        options.scope = scope;
    if (cwd !== undefined && cwd !== '')
        options.cwd = cwd;
    const snapshot = await ctx.skills.snapshot(options);
    // Contract: `snapshot.skills` is an array of summaries. If an upgrade changes
    // that shape, treat it as "no skills" (safe: nothing to switch) but alarm, so
    // an empty skills tab reads as a drift signal rather than a silent blank.
    if (!Array.isArray(snapshot?.skills)) {
        onDrift?.('skills.snapshot.shape', 'capability-toggle: skills.snapshot() returned no `skills` array '
            + '(DSH skills surface may have changed); the skills tab will be empty.');
        return [];
    }
    return snapshot.skills
        .map((skill) => ({
        id: skillId(skill.name),
        name: skill.name,
        description: skill.description,
        kind: 'skill',
    }))
        .sort(byName);
}
/**
 * Tool rows split into MCP server groups and plain tools. Every MCP member tool
 * keeps its OWN switch id so it can be enabled or disabled on its own; the group
 * row still carries them all, because its switch is their default. The `skill`
 * tool itself is excluded — skills are switched on the skills tab, and denying
 * the loader tool would be a coarser, confusing duplicate.
 */
function collectTools(ctx, scope, onDrift) {
    const schemas = ctx.tools.schemas(scope);
    const mcpMembers = new Map();
    const plain = [];
    // Contract: `schemas(scope)` is an iterable of `{ name, description? }`. A
    // non-iterable return means the tools surface changed shape upstream; alarm
    // and yield nothing (the tools/MCP tabs go empty) rather than throwing out of
    // reconcile, which would abort enforcement for the whole agent.
    if (schemas == null || typeof schemas[Symbol.iterator] !== 'function') {
        onDrift?.('tools.schemas.shape', 'capability-toggle: tools.schemas() is not iterable '
            + '(DSH tools surface may have changed); the tools and MCP tabs will be empty.');
        return { mcps: [], tools: [] };
    }
    for (const schema of schemas) {
        // Contract: every schema carries a string `name`. A non-string means the
        // tool-schema shape drifted; skip the bad entry (rather than throwing or
        // minting a `tool:undefined` switch) and alarm once.
        if (typeof schema?.name !== 'string') {
            onDrift?.('tools.schemas.name', 'capability-toggle: a tool schema had no string `name` '
                + '(DSH tool-schema shape may have changed); that entry is skipped.');
            continue;
        }
        if (schema.name === SKILL_TOOL_NAME)
            continue;
        const mcp = MCP_NAME.exec(schema.name);
        if (mcp !== null) {
            const server = mcp[1];
            const list = mcpMembers.get(server) ?? [];
            list.push({
                // The switch key is built from the PUBLIC name's suffix, so an id never
                // has to be parsed back into a wire tool name (the raw name is only ever
                // sent in `tools/call`, see the mcp-client naming contract).
                id: mcpToolId(server, schema.name.slice(mcp[0].length)),
                name: schema.name,
                description: schema.description ?? '',
            });
            mcpMembers.set(server, list);
            continue;
        }
        plain.push({
            id: toolId(schema.name),
            name: schema.name,
            description: schema.description ?? '',
            kind: 'tool',
        });
    }
    const mcps = [...mcpMembers.entries()]
        .map(([server, members]) => ({
        id: mcpId(server),
        name: server,
        description: `MCP server "${server}" — ${members.length} tool(s)`,
        kind: 'mcp',
        memberTools: members.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    }))
        .sort(byName);
    plain.sort(byName);
    return { mcps, tools: plain };
}
/** Sort descriptors by display name using code-point order. */
function byName(a, b) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
/**
 * Map every disabled switch id to the concrete tool names it denies, for one
 * inventory. A `tool:<name>` denies that tool; an `mcptool:<server>/<rest>`
 * denies exactly its one member tool; a `skill:<name>` denies nothing here
 * (skills are enforced by scoped shadow, not tool restriction).
 *
 * The GROUP id `mcp:<server>` denies nothing on its own, deliberately: it is the
 * members' default, and the resolver already folded it into each member's
 * effective stance (`disabledIdsForInventory`). Re-checking it here would let a
 * group OFF kill a member explicitly switched ON at the same level, which is the
 * opposite of the "more specific statement wins" rule the panel shows.
 * @param descriptors - the inventory.
 * @param disabledIds - the switch ids resolved to disabled.
 * @returns the concrete tool names to deny through `ctx.tools.restrict`.
 */
export function deniedToolNames(descriptors, disabledIds) {
    const denied = [];
    for (const d of descriptors) {
        if (d.kind === 'tool') {
            if (disabledIds.has(d.id))
                denied.push(d.name);
            continue;
        }
        if (d.kind === 'mcp' && d.memberTools !== undefined) {
            for (const m of d.memberTools) {
                if (disabledIds.has(m.id))
                    denied.push(m.name);
            }
        }
    }
    return denied;
}
/**
 * The disabled skill names from an inventory, for scoped shadowing.
 * @param descriptors - the inventory.
 * @param disabledIds - the switch ids resolved to disabled.
 * @returns the skill names to shadow with a non-model-invocable stub.
 */
export function disabledSkillNames(descriptors, disabledIds) {
    const names = [];
    for (const d of descriptors) {
        if (d.kind === 'skill' && disabledIds.has(d.id))
            names.push(d.name);
    }
    return names;
}
/**
 * Map every disabled PLAIN tool to the name of its usage-guidance prompt
 * section, so the section can be shadowed away when the tool is off. By
 * convention each tool contributes one `systemPrompt.section` named
 * `tool:<toolName>` (e.g. `tool:bash`, `tool:web_search`) — the same string as
 * our `tool:<name>` switch id, which is exactly why the switch id doubles as
 * the section name here.
 *
 * Only plain tools qualify:
 *   - `skill` rows use the skill-shadow seam and have no such section.
 *   - `mcp` group rows deny member tools whose guidance sections (if any) are
 *     not named after the group, so there is nothing deterministic to shadow.
 *
 * Shadowing a section is best-effort cosmetics (it saves prompt tokens and
 * removes stale guidance for an already-denied tool); a tool that ships no
 * such section simply has its empty shadow render to nothing, which is inert.
 * @param descriptors - the inventory.
 * @param disabledIds - the switch ids resolved to disabled.
 * @returns the `tool:<name>` guidance section names to shadow with empty text.
 */
export function disabledToolGuidanceSections(descriptors, disabledIds) {
    const names = [];
    for (const d of descriptors) {
        if (d.kind === 'tool' && disabledIds.has(d.id))
            names.push(`tool:${d.name}`);
    }
    return names;
}
