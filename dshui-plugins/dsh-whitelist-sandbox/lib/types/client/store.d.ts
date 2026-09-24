/**
 * Whitelist settings store: the browser-side projection of this plugin's own
 * profile entry, read and written through the shared `configForms` service.
 * The entry id IS the settings namespace (0.1.7 moved settings from
 * `$DSH_HOME/settings.yaml` sections into the profile patch document, keyed by
 * loader entry id), and `extraWritableRoots` is the one volatile field.
 * Split from the React section so the logic is unit-testable without pulling
 * in the browser bundle.
 */
/** This plugin's profile entry id — the settings namespace its Host row
 * carries. Must match `cordis.patch.yml`'s inserted id. */
export declare const SETTINGS_NS = "dsh-whitelist-sandbox";
/** The single config field this page edits. */
export declare const SETTINGS_FIELD = "extraWritableRoots";
export type WhitelistStatus = 'loading' | 'ready' | 'unavailable';
export interface WhitelistStoreState {
    status: WhitelistStatus;
    writable: boolean;
    roots: string[];
    revision: number | undefined;
}
export interface WhitelistSaveOutcome {
    ok: boolean;
    error?: string;
}
/** One `ConfigForm<T>` snapshot, narrowed to the fields this page reads. */
export interface WhitelistFormSnapshot {
    status: WhitelistStatus;
    /** Last accepted schema-resolved section; undefined before the first acceptance. */
    value?: {
        extraWritableRoots?: string[];
    };
    revision: number | undefined;
    writable: boolean;
}
/**
 * The subset of `@deepseek-ai/dsh-client-ui-settings`'s `ConfigForm<T>` this
 * page consumes, declared structurally so the store runs under node with a
 * fake and the bundle keeps the module external.
 */
export interface WhitelistConfigForm {
    /** @returns the current sync snapshot (stable reference until the next change). */
    getSnapshot(): WhitelistFormSnapshot;
    subscribe(listener: () => void): () => void;
    /** Queue one field write; resolves true for Host acceptance. */
    set(field: string, value: unknown): Promise<boolean>;
}
/**
 * Read-only projection plus the one write of `extraWritableRoots`. The derived
 * snapshot is cached by the underlying form snapshot's identity so
 * `useSyncExternalStore` sees a stable reference between real changes.
 */
export declare class WhitelistSettingsStore {
    private readonly form;
    private lastForm;
    private cached;
    constructor(form: WhitelistConfigForm);
    getSnapshot(): WhitelistStoreState;
    subscribe(listener: () => void): () => void;
    save(roots: string[]): Promise<WhitelistSaveOutcome>;
    /** The form is owned by the shared `configForms` provider; nothing to release. */
    dispose(): void;
}
