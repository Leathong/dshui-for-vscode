import type { LevelScope } from './tabs.ts';
export interface PanelPrefs {
    readonly showFraction: boolean;
    readonly showUsage: boolean;
    readonly levels: LevelScope;
}
export interface PrefsStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export declare const PREFS_KEY = "dsh-capability-toggle-plugin:panel-prefs";
export declare const DEFAULT_PREFS: PanelPrefs;
export declare function readPrefs(storage?: PrefsStorage | undefined): PanelPrefs;
export declare function writePrefs(prefs: PanelPrefs, storage?: PrefsStorage | undefined): void;
