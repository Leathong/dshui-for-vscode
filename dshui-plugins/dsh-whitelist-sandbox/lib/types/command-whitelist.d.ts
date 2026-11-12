/** Why a raw command line was refused, or the simple commands it contains. */
export type ParseCommandLineResult = {
    readonly ok: true;
    readonly value: ParsedCommandLine;
} | {
    readonly ok: false;
    readonly reason: string;
};
/** One decomposable command line: every simple command as its argv tokens,
 * plus every redirection it carries. */
export interface ParsedCommandLine {
    readonly segments: readonly (readonly string[])[];
    readonly redirects: readonly Redirect[];
}
/** Redirection operator shapes this scanner understands. */
export type RedirectOperator = '>' | '>>' | '>&' | '<' | '<&' | '&>' | '&>>';
/**
 * One redirection. `kind` is the security-relevant part: `file` writes or reads
 * a real path and therefore needs target validation; `null` is `/dev/null`,
 * `fd` duplicates a file descriptor and `close` closes one — none of those
 * touch a path.
 */
export interface Redirect {
    readonly kind: 'file' | 'null' | 'fd' | 'close';
    readonly operator: RedirectOperator;
    readonly target: string;
    /** Whether any part of the target word was quoted (the target check treats
     * tilde/glob characters conservatively either way). */
    readonly quoted: boolean;
}
/** One validated whitelist entry: its operator text plus parsed argv tokens. */
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
 * Decompose a raw `bash -c` source into simple commands, refusing anything
 * this scanner does not fully understand. Never evaluates or rewrites the
 * command. Redirections are normally refused (the shell, not the whitelisted
 * program, performs them, so any file target is an unconfined write); the only
 * accepted forms are the ones with NO file effect: a target that is exactly
 * `/dev/null`, and file-descriptor duplication/close (`2>&1`, `2>&-`).
 * @param raw - the exact source the bash tool was asked to run.
 * @param options - `allowRedirections: false` refuses every redirect (used for
 *   whitelist entries, which must be plain simple commands).
 * @returns the argv tokens of every simple command, or why it is ineligible.
 */
export declare function parseCommandLine(raw: string, options?: {
    readonly allowRedirections?: boolean;
}): ParseCommandLineResult;
/**
 * Whether one redirection has no file effect at all; such redirects never need
 * a target check.
 * @param redirect - one classified redirection.
 * @returns true for a `/dev/null` target, fd duplication or close.
 */
export declare function redirectHasNoFileEffect(redirect: Redirect): boolean;
/**
 * Validate one operator-typed whitelist entry: exactly one simple command,
 * no forwarder/shell as its program, no reserved word, no glob.
 * @param raw - the entry text as stored in the plugin configuration.
 * @returns the parsed entry, or why it cannot be used.
 */
export declare function parseEntry(raw: string): ParseEntryResult;
/**
 * Whether one simple command's argv starts with an entry's tokens.
 * @param argv - the simple command's argv tokens.
 * @param entry - the validated entry tokens.
 * @returns true when every entry token equals the argv token at its position.
 */
export declare function entryAllows(argv: readonly string[], entry: readonly string[]): boolean;
/**
 * Analyze one raw line against the entries: it must decompose, contain at
 * least one simple command, and EVERY simple command must be allowed by at
 * least one entry. Redirections are returned unjudged so the caller can apply
 * its own target policy.
 * @param raw - the exact `bash -c` source.
 * @param entries - validated entries (empty means nothing is exempt).
 * @returns the parsed line when every segment matches, otherwise undefined.
 */
export declare function analyzeWhitelistedLine(raw: string, entries: readonly CommandEntry[]): ParsedCommandLine | undefined;
/**
 * Strict pure check: the line must match the entries AND every redirection must
 * have no file effect. The executor uses {@link analyzeWhitelistedLine} plus an
 * asynchronous target check instead, so a file redirect into a writable root
 * can stay exempt; this function remains the fail-closed API for callers that
 * cannot do filesystem work.
 * @param raw - the exact `bash -c` source.
 * @param entries - validated entries (empty means nothing is exempt).
 * @returns true only when the line matches and no redirect touches a path.
 */
export declare function isCommandWhitelisted(raw: string, entries: readonly CommandEntry[]): boolean;
/**
 * Validate a stored entry list before it persists. Throws on the first unusable
 * entry so the settings save is refused with the exact reason and the profile
 * document stays clean (`configEditor.edit` runs this through the
 * `internal/config` waterfall).
 * @param raw - the candidate entry list.
 * @returns the parsed entries, deduplicated by their normalized tokens.
 * @throws Error naming the offending entry and why it cannot be used.
 */
export declare function validateCommandEntries(raw: readonly string[]): CommandEntry[];
/**
 * Live whitelist source over a schemastery `volatile()` reference. The bash
 * executor reads `allows()` per call, so a settings hot-reload applies
 * immediately without remounting.
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
    /**
     * Whole-line check against the live entries.
     * @param command - the exact `bash -c` source.
     * @returns true when the entire line is covered by the whitelist.
     */
    allows(command: string): boolean;
    /** Recompute the effective entries from the current volatile value. */
    private refresh;
}
