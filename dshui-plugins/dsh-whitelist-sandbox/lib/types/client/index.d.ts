import { WhitelistSettingsStore } from './store.ts';
import type { SettingsDescribeFace, SettingsRemote } from './store.ts';
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
    settingsScope: {
        describe(): SettingsDescribeFace;
    };
    remote: {
        settings: SettingsRemote;
    };
    slots: {
        inject(name: string, provider: () => () => void): void;
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
 * Required client services. Both the base `remote` service and the
 * `remote.settings` namespace must be injected: `ctx.remote` builds the
 * accessor receiver, and `remote.settings` (the settings-document Remote
 * namespace mounted by dsh-api-remotes) is the exposed sub-service the
 * section reads/writes through `ctx.remote.settings`.
 */
export declare const inject: string[];
/**
 * Register the whitelist section once the `settings.section` declaration
 * is on the ledger, wire its store to the settings scope, and refresh on
 * every pushed settings invalidation.
 */
export declare function apply(ctx: WhitelistClientContext): void;
export { WhitelistSettingsStore } from './store.ts';
export type { WhitelistStoreState } from './store.ts';
