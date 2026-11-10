import type { StoredDocument } from './config.ts';
export type LegacyOverridesResult = {
    readonly status: 'available';
    readonly value: StoredDocument;
} | {
    readonly status: 'unavailable';
} | {
    readonly status: 'invalid';
};
export declare function mergeLegacyOverrides(current: StoredDocument, legacy: unknown, completed?: boolean): StoredDocument;
export declare function readLegacyOverridesSyncResult(): LegacyOverridesResult;
export declare function readLegacyOverrides(): Promise<StoredDocument | undefined>;
export declare function parseLegacyOverridesResult(source: string): LegacyOverridesResult;
export declare function parseLegacyOverrides(source: string): StoredDocument | undefined;
