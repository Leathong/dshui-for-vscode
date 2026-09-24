/**
 * Locale dictionaries for the capability-toggle panel. `zh` is the key-set
 * source of truth; `en` is checked complete against it. Placeholders use the
 * `{name}` form the harness translator interpolates. The two are exported
 * together as `dictionaries` for `ctx.locale.register(NS, dictionaries)`.
 *
 * @module dsh-capability-toggle-plugin/client/locales
 */
import type { LocaleDict } from './types.ts';
/** Dictionary namespace this plugin owns. */
export declare const NS = "capability-toggle";
/** Both dictionaries, in the shape `ctx.locale.register` expects. */
export declare const dictionaries: {
    readonly zh: LocaleDict;
    readonly en: LocaleDict;
};
