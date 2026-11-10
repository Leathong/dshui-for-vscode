/**
 * Capability inventory: enumerate the switchable skills, MCP server groups, and
 * plain tools visible to one agent scope, as the descriptor rows the UI lists
 * and the id universe the resolver evaluates against.
 *
 * Three kinds, three sources:
 *   - `skill`: `ctx.skills.snapshot({ scope })` — every model-invocable skill
 *     summary (name + routing description).
 *   - `mcp`:   tools named `mcp__<server>__<rawName>` (the mcp-client public
 *     name grammar), grouped by `<server>` into one group row that carries its
 *     member tools. Each member gets its OWN switch, and the group's `mcp:<server>`
 *     switch is the members' default (see shared/resolve.ts `mcpMemberStance`):
 *     MCP tools are opt-in, so a member with nothing set anywhere is disabled.
 *     A group with no member enabled shadows the server's `mcp:<server>`
 *     instructions section, and shared resource calls naming it are refused.
 *   - `tool`:  every other model-facing tool from `ctx.tools.schemas(scope)`.
 *
 * The switch id namespaces are disjoint: `skill:<name>`, `mcp:<server>`,
 * `mcptool:<server>/<rest>`, `tool:<name>`. This keeps one flat OverrideMap
 * unambiguous across kinds.
 *
 * @module dsh-capability-toggle-plugin/host/inventory
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ScopeKey } from '@deepseek-ai/dsh-scope';
import type { CapabilityDescriptor } from '../shared/types.ts';
/** Build the `skill:<name>` switch id. */
export declare function skillId(name: string): string;
/** Build the `mcp:<server>` switch id. */
export declare function mcpId(server: string): string;
/**
 * Build the `mcptool:<server>/<rawName>` switch id for ONE member tool of a
 * server, where `rawName` is the public name after `mcp__<server>__`. Distinct
 * from {@link mcpId}: the group id is the member's default, the member id is the
 * tool's own switch.
 */
export declare function mcpToolId(server: string, rawName: string): string;
/** Build the `tool:<name>` switch id. */
export declare function toolId(name: string): string;
/**
 * Attribute one model tool call to the switch id whose row should count it.
 * An MCP call counts on its MEMBER switch (`mcptool:<server>/<rest>`), so the
 * per-tool rows carry their own usage and the server row shows the sum; skills
 * count on the invoked skill (the loader tool's argument), not on `skill`; a
 * shared MCP resource call counts on the server group it names; every other tool
 * counts on its own `tool:<name>` row.
 * @param name - the model-facing tool name that ran.
 * @param args - that call's arguments (used for the skill loader and the shared
 *   MCP resource tools, which name their target server).
 * @returns the switch id to credit, or undefined when nothing should be.
 */
export declare function attributeCall(name: string, args: unknown): string | undefined;
/**
 * A drift sink: called with a stable key and a message when a framework surface
 * this path reads returns a shape it did not expect. Passing one lets the
 * inventory turn a silent shape drift (e.g. `skills.snapshot()` no longer
 * exposing a `skills` array) into a warn-once alarm instead of an empty list
 * the operator cannot distinguish from "genuinely nothing to switch". Optional:
 * omitting it keeps `collectInventory` a pure read, so unit tests need no sink.
 */
export type DriftSink = (key: string, message: string) => void;
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
export declare function collectInventory(ctx: Context, scope: ScopeKey | undefined, cwd?: string, onDrift?: DriftSink): Promise<CapabilityDescriptor[]>;
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
export declare function deniedToolNames(descriptors: readonly CapabilityDescriptor[], disabledIds: ReadonlySet<string>): string[];
/**
 * The disabled skill names from an inventory, for scoped shadowing.
 * @param descriptors - the inventory.
 * @param disabledIds - the switch ids resolved to disabled.
 * @returns the skill names to shadow with a non-model-invocable stub.
 */
export declare function disabledSkillNames(descriptors: readonly CapabilityDescriptor[], disabledIds: ReadonlySet<string>): string[];
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
 *   - `mcp` group rows shadow their instructions section through
 *     {@link disabledMcpInstructionSections} instead — their member tools'
 *     guidance sections (if any) are named after the members, not the group.
 *
 * Shadowing a section is best-effort cosmetics (it saves prompt tokens and
 * removes stale guidance for an already-denied tool); a tool that ships no
 * such section simply has its empty shadow render to nothing, which is inert.
 * @param descriptors - the inventory.
 * @param disabledIds - the switch ids resolved to disabled.
 * @returns the `tool:<name>` guidance section names to shadow with empty text.
 */
export declare function disabledToolGuidanceSections(descriptors: readonly CapabilityDescriptor[], disabledIds: ReadonlySet<string>): string[];
/**
 * Map every disabled MCP server group to the name of its instructions prompt
 * section. `dsh-mcp-client` registers each connected server's instruction
 * snapshot (the `### MCP server: <name>` block the server itself supplies) as
 * one `systemPrompt.section` named exactly `mcp:<serverName>` — the same
 * string as our `mcp:<server>` switch id — so the id doubles as the section
 * name, exactly like the plain-tool guidance case above.
 *
 * Without this shadow a switched-off server's instructions stay in the model's
 * prompt and keep issuing directives (e.g. "make kb.recall your first tool
 * call") for tools the deny already removed, which is prompt injection the
 * user cannot switch off any other way.
 *
 * @param descriptors - the inventory.
 * @param disabledIds - the switch ids resolved to disabled.
 * @returns the `mcp:<server>` instructions section names to shadow with empty
 *   text.
 */
export declare function disabledMcpInstructionSections(descriptors: readonly CapabilityDescriptor[], disabledIds: ReadonlySet<string>): string[];
