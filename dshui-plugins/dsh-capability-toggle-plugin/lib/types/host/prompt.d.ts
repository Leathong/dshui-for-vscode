/**
 * Prompt-context capability family: switchable system-prompt contributions
 * beyond tools and skills.
 *
 * Unlike tools/skills — enumerated live from their registries — the promptable
 * surface is a CURATED ALLOWLIST. The `dsh-system-prompt` registry exposes many
 * sections/contexts, but only a few are SAFE to gate per scope:
 *
 *   - `deployment:persona`   — the order-0 persona; empty text is a documented
 *                              first-class state, so shadowing it is safe.
 *   - `sandbox:policy`       — runtime-context telling the model the sandbox
 *   - `approval:policy`        mode / approval policy. Gating only changes what
 *                              the model is TOLD, never what is ENFORCED (the
 *                              owning services keep running).
 *   - a coarse "hide all runtime context" switch backed by
 *     `suppressRuntimeContext()`.
 *
 * Deliberately EXCLUDED (would break the model or the render):
 *   - `harness:identity`            — the model's framework grounding.
 *   - `tools:code-only`/`tools:sdk` — protocol-critical in code-presentation.
 *   - `provider`/`model`/`cwd`      — strict-interpolated variables; shadowing
 *                                     one to empty throws at render.
 *
 * Every gate is the SAME mechanism tools/skills use: register a same-name entry
 * in the agent's scope. A scoped same-name section/context shadows the global
 * one (nearest-scope-wins in the assembly merge) and, being empty, is dropped
 * at render — so the model no longer reads it, while the owning service is
 * untouched. All registrations are Cordis effects (return a disposer).
 *
 * Presence is PROBED, not assumed: `assemble({ scope })` reports which section
 * and context names are actually active for this scope, so a deployment that
 * never registered `sandbox:policy` simply shows no switch for it.
 *
 * @module dsh-capability-toggle-plugin/host/prompt
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ScopeKey } from '@deepseek-ai/dsh-scope';
import type { CapabilityDescriptor } from '../shared/types.ts';
/**
 * The single coarse runtime-context suppressor switch id. Unlike the other
 * prompt ids (`prompt:section:<name>` / `prompt:context:<name>`, 3 segments,
 * each targeting one named registry entry), this is an intentionally bare
 * 2-segment singleton: it shadows no specific name, it toggles the all-or-
 * nothing `suppressRuntimeContext()` seam, so there is no `<name>` to carry.
 */
export declare const RUNTIME_SUPPRESS_ID = "prompt:runtime";
/**
 * Enumerate the promptable capabilities that ACTUALLY exist for one scope.
 *
 * Probes the live assembly for this scope and keeps only allowlisted names that
 * are present, plus the always-available coarse runtime suppressor. Pure read:
 * `assemble` registers nothing. Returns `[]` when there is no scope (a global
 * shadow would collide with the framework's own same-name registration) or when
 * `systemPrompt` is unavailable.
 *
 * @param ctx - a context that can read `systemPrompt` (the scoped ctx).
 * @param scope - the agent scope key; undefined disables prompt gating.
 * @returns descriptors carrying the i18n key in `name` (the UI resolves it).
 */
export declare function collectPromptGates(ctx: Context, scope: ScopeKey | undefined): Promise<CapabilityDescriptor[]>;
/**
 * Apply prompt-gate enforcement for one scope: for every disabled prompt switch,
 * register the matching empty shadow (section/context) or the runtime
 * suppressor. Each returns a Cordis disposer, collected by the caller.
 *
 * MUST be called on a SCOPED context (never the host root): a same-name section
 * or context in the global layer collides with the framework's own registration
 * and throws. The caller gates on `scope !== undefined` before invoking.
 *
 * @param scopedCtx - the agent's scoped context.
 * @param descriptors - this scope's promptable inventory.
 * @param disabledIds - switch ids resolved to disabled.
 * @returns disposers for every shadow/suppressor installed.
 */
export declare function applyPromptGates(scopedCtx: Context, descriptors: readonly CapabilityDescriptor[], disabledIds: ReadonlySet<string>): Array<() => void>;
