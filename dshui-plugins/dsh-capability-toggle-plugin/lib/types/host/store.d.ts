import type { Context } from '@deepseek-ai/cordis';
import type { LayeredOverrides, OverrideMap, ToggleLevel, ToggleState } from '../shared/types.ts';
import type { OverrideConfig, StoredDocument } from './config.ts';
export type LevelSelector = {
    readonly level: 'global';
} | {
    readonly level: 'project';
    readonly key: string;
} | {
    readonly level: 'session';
    readonly key: string;
};
export declare class OverrideStore {
    private readonly ctx;
    private readonly config;
    private readonly legacy;
    constructor(ctx: Context, config: OverrideConfig, legacy?: StoredDocument);
    read(): StoredDocument;
    layered(projectKey: string, sessionKey: string): LayeredOverrides;
    migrateLegacy(source?: StoredDocument): Promise<boolean>;
    set(selector: LevelSelector, id: string, state: ToggleState): Promise<void>;
    setMany(selector: LevelSelector, ids: readonly string[], state: ToggleState): Promise<void>;
    private entry;
    private persist;
}
export declare function writeMap(map: OverrideMap, id: string, state: ToggleState): OverrideMap;
export declare const WRITABLE_LEVELS: readonly ToggleLevel[];
