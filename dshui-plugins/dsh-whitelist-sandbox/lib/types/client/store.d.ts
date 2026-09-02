/** The settings-document namespace this section reads/writes. */
export declare const SETTINGS_NS = "sandbox-whitelist";
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
export interface SettingsDescribeFace {
    ensure(): Promise<void>;
    getSnapshot(): {
        view?: {
            writable: boolean;
            namespaces: readonly {
                ns: string;
                revision?: number;
                value?: {
                    extraWritableRoots?: string[];
                };
            }[];
        };
    };
    subscribe(listener: () => void): () => void;
}
export interface SettingsRemote {
    mutate(namespace: string, ops: readonly {
        op: string;
        path: string[];
        value: unknown;
    }[], revision?: number): Promise<{
        ok: boolean;
        error?: {
            message?: string;
        };
    }>;
}
export declare class WhitelistSettingsStore {
    private readonly settingsRemote;
    private readonly store;
    private disposed;
    readonly describeFace: SettingsDescribeFace;
    constructor(settingsScope: {
        describe(): SettingsDescribeFace;
    }, settingsRemote: SettingsRemote);
    getSnapshot(): WhitelistStoreState;
    subscribe(listener: () => void): () => void;
    load(): Promise<void>;
    save(roots: string[]): Promise<WhitelistSaveOutcome>;
    dispose(): void;
}
