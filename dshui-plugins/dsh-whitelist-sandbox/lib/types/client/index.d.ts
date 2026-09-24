import { WhitelistSettingsStore } from './store.ts';
import type { WhitelistConfigForm } from './store.ts';
/** The browser-half services this bundle needs (the client roster `dsh.client`
 * injects the counterpart modules that provide them). */
interface WhitelistClientContext {
    effect(disposer: () => void, label?: string): void;
    locale: {
        register(ns: string, dict: {
            zh: Record<string, string>;
            en: Record<string, string>;
        }): () => void;
        bind(ns: string): (key: string) => string;
    };
    /** 0.1.7 settings seam: `configForms.get(entryId)` yields the shared form for
     * one Host plugin entry, and `whileServed` keeps a contribution alive only
     * while that entry is actually served. */
    configForms: {
        get(entryId: string): WhitelistConfigForm;
        whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void;
    };
    slots: {
        inject(name: string, provider: () => () => void): () => void;
        register(slot: {
            name: string;
            id: string;
            order: number;
            label: () => string;
            inject: () => unknown;
        }, component: unknown): () => void;
    };
}
/** The settings-page section: edit the whitelist path list, save via the document. */
export declare function WhitelistSection({ controller, t }: {
    controller: WhitelistSettingsStore;
    t: (key: string) => string;
}): import("react").ReactElement<any, string | import("react").JSXElementConstructor<any>>;
/**
 * Required client services. `configForms` (provided by
 * `@deepseek-ai/dsh-client-ui-settings`) owns the settings mirror and the write
 * transport, so this bundle no longer injects `remote` / `remote.settings`.
 */
export declare const inject: string[];
/**
 * Publish the whitelist section into the settings nav while the Host serves
 * this plugin's entry, and bind it to that entry's shared configuration form.
 * The form already derives from the settings mirror, so there is no separate
 * refresh-on-invalidation wiring: its own subscription drives re-renders.
 */
export declare function apply(ctx: WhitelistClientContext): void;
export { WhitelistSettingsStore } from './store.ts';
export type { WhitelistStoreState } from './store.ts';
