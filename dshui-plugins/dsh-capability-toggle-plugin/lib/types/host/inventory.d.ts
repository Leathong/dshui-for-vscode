/**
 * Capability inventory: enumerate the switchable skills, MCP server groups, and
 * plain tools visible to one agent scope, as the descriptor rows the UI lists
 * and the id universe the resolver evaluates against.
 *
 * Three kinds, three sources:
 *   - `skill`: `ctx.skills.snapshot({ scope })` — every model-invocable skill
 *     summary (name + routing description).
 *   - `mcp`:   tools named `mcp__<server>__<rawName>` (the mcp-client public
 *     name grammar), grouped by `<server>` into one switch per server; a group
 *     switch denies every member tool.
 *   - `tool`:  every other model-facing tool from `ctx.tools.schemas(scope)`.
 *
 * The switch id namespaces are disjoint: `skill:<name>`, `mcp:<server>`,
 * `tool:<name>`. This keeps one flat OverrideMap unambiguous across kinds.
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
/** Build the `tool:<name>` switch id. */
export declare function toolId(name: string): string;
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
 * inventory. A `tool:<name>` denies that tool; an `mcp:<server>` denies all its
 * member tool names; a `skill:<name>` denies nothing here (skills are enforced
 * by scoped shadow, not tool restriction).
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
export declare function disabledToolGuidanceSections(descriptors: readonly CapabilityDescriptor[], disabledIds: ReadonlySet<string>): string[];
