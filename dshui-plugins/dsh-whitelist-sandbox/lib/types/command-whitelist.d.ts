/** One validated whitelist entry: its operator text plus the literal prefix
 * tokens (always at least one). */
export interface CommandEntry {
    readonly source: string;
    readonly tokens: readonly string[];
}
/** Why one whitelist entry is unusable, or its parsed tokens. */
export type ParseEntryResult = {
    readonly ok: true;
    readonly value: CommandEntry;
} | {
    readonly ok: false;
    readonly reason: string;
};
/** Logger surface the live entry source uses; a cordis logger satisfies it. */
export interface CommandWhitelistLogger {
    warn(message: string): void;
    error(message: string): void;
    debug?(message: string): void;
}
/**
 * Validate one operator-typed whitelist entry.
 * @param raw - the entry text as stored in the plugin configuration.
 * @returns the parsed entry (literal argv prefix), or why it cannot be used.
 */
export declare function parseEntry(raw: string): ParseEntryResult;
/**
 * Validate a stored entry list before it persists. Throws on the first unusable
 * entry so the settings save is refused with the exact reason, and the profile
 * document stays clean.
 * @param raw - the candidate entry list.
 * @returns the parsed entries, deduplicated by their normalized tokens.
 * @throws Error naming the offending entry and why it cannot be used.
 */
export declare function validateCommandEntries(raw: readonly string[]): CommandEntry[];
/**
 * Live whitelist source over a schemastery `volatile()` reference. The bash
 * executor and the analyzer read `entries` per call, so a settings hot-reload
 * applies immediately without remounting.
 *
 * Unusable stored entries are dropped individually with an error log (they
 * grant nothing, so dropping is fail-closed) and the rest stays effective.
 * This never throws: a bad stored value must not fail the plugin row and strip
 * `shell`/`fs` from the tree.
 */
export declare class CommandWhitelist {
    private readonly read;
    private readonly logger;
    private lastRaw;
    private value;
    constructor(read: () => readonly string[] | undefined, logger: CommandWhitelistLogger | undefined);
    /** The currently effective entries. */
    get entries(): CommandEntry[];
    /** Recompute the effective entries from the current volatile value. */
    private refresh;
}
