/**
 * One-shot stylesheet injection for the capability-toggle control. The plugin
 * uses no CSS Modules (that build pipeline is monorepo-internal); instead it
 * injects one `<style data-plugin=...>` tag on first import, idempotent across
 * re-imports. Colors come from the shared `--dsw-*` theme tokens so the control
 * matches the surrounding composer chrome in every theme.
 *
 * @module dsh-capability-toggle-plugin/client/styles
 */
/**
 * Inject the stylesheet once, returning a disposer that removes the tag it
 * created. Idempotent and SSR-safe: a no-op returning a no-op disposer when
 * `document` is absent or the tag already exists (so a second caller never
 * removes the first caller's tag). Wire the disposer into the client's
 * `ctx.effect` so the stylesheet is torn down on unload/HMR instead of leaking
 * a stale `<style>` into `document.head`.
 *
 * Dedup key: the single `data-plugin` attribute — query, write, and the module
 * comment all agree on one marker, so a host cleanup or older build that only
 * knows `data-plugin` can never miss it and double-inject.
 *
 * @returns a disposer removing the injected tag, or a no-op when none was added.
 */
export declare function injectStyles(): () => void;
