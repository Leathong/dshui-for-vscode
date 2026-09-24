import type { Context, Volatile } from '@deepseek-ai/cordis';
import type { ConfinedArgv, SandboxExecutionPolicy, SandboxPolicy } from '@deepseek-ai/dsh-sandbox';
import type { FsTarget } from '@deepseek-ai/dsh-fs';
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox';
import type { Config as SandboxedFileSystemConfig } from '@deepseek-ai/dsh-fs-sandbox';
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox';
import type { Config as SandboxBashConfig } from '@deepseek-ai/dsh-bash-sandbox';
import z from '@deepseek-ai/schemastery';
/**
 * Inject the extra writable grants into a stock-confined runner argv. The
 * runner shapes are the `dsh-sandbox-local` dialects (Seatbelt SBPL string,
 * bwrap mount flags, Landlock `--ro/--rw` flag pairs); anything else — the
 * operator `runnerCommand` override or the windows-acl runner — is returned
 * untouched (no silent widening).
 * @param argv - the stock provider's confined argv.
 * @param extraRoots - canonical extra writable roots; missing roots are skipped
 *   (a missing bwrap `--bind` source fails the whole command).
 * @returns the modified argv, or the original when nothing applies.
 */
export declare function injectExtraRootGrants(argv: readonly string[], extraRoots: string[]): string[];
/**
 * Canonicalize the configured whitelist roots: realpath when possible (so the
 * grants match the fence's canonical comparisons), deduplicated, warning on
 * roots that currently do not exist.
 */
export declare function canonicalizeExtraRoots(roots: readonly string[] | undefined, logger: {
    warn(message: string): void;
} | undefined): string[];
/**
 * The security guard: a whitelist root must never make the DSH policy state
 * writable. `$DSH_HOME` holds the profile patch document the settings page
 * writes, credentials, and session logs — if a root lexically contains them, a
 * jailbroken model could rewrite the policy document and widen its own
 * sandbox. Throws on the first offending root.
 * @param roots - canonical whitelist roots.
 * @param store - the live settings-document path and harness home.
 */
export declare function assertSafeWhitelistRoots(roots: readonly string[], store: WhitelistGuardStore): void;
/** Reject a non-empty whitelist on Windows: the ACL restricted-token runner
 * grants per-workspace write SIDs only, so extra roots cannot be enforced. */
export declare function assertSupportedWhitelistPlatform(roots: readonly string[]): void;
/** Logger surface the whitelist source uses; a cordis logger satisfies it. */
export interface WhitelistLogger {
    warn(message: string): void;
    error(message: string): void;
}
/** Policy-state locations the security guard must keep unwritable. */
export interface WhitelistGuardStore {
    /** Live settings/policy document (the active profile patch) when known,
     * otherwise the legacy `$DSH_HOME/settings.yaml`. */
    settingsPath: string;
    /** Canonical harness home. */
    dshHome: string;
}
/**
 * Live whitelist source over a schemastery `volatile()` reference: both
 * enforcement sides read `roots` per call, so a settings hot-reload applies
 * immediately without restarting anything. Every read re-runs canonicalization
 * and the security guard; a rejected value is logged loudly and the previous
 * good whitelist is kept, so a bad stored value can neither widen the sandbox
 * nor fail the plugin load.
 */
export declare class WhitelistRoots {
    private readonly read;
    private readonly store;
    private readonly logger;
    private lastRaw;
    private value;
    constructor(read: () => readonly string[] | undefined, store: WhitelistGuardStore, logger: WhitelistLogger | undefined);
    /** The currently applied canonical extra roots. */
    get roots(): string[];
    /**
     * Recompute the effective roots from the current volatile value. The
     * volatile reference is a frozen snapshot the loader swaps wholesale, so an
     * identity change is exactly "the operator changed the configuration".
     * A guard failure keeps the previous value (fail closed, never brick).
     */
    private refresh;
}
/**
 * bash side: keeps the stock wrap, injects the extra grants into the selected
 * runner's argv. Constructing it registers `ctx.shell` (Service name chain).
 */
export declare class WhitelistBashExecutor extends SandboxBashExecutor {
    private readonly rootsSource;
    constructor(ctx: Context, config: SandboxBashConfig, rootsSource: WhitelistRoots);
    confine(command: string, policy: SandboxPolicy, signal?: AbortSignal): Promise<ConfinedArgv>;
}
/**
 * fs side: when the stock fence denies under workspace-write, fall back to the
 * whitelist containment. Constructing it registers `ctx.fs` (Service name
 * chain). Denials for non-whitelisted targets keep the structured
 * `FS_SANDBOX_DENIED` the tool layer maps to the model-facing marker.
 */
export declare class WhitelistFileSystem extends SandboxedFileSystem {
    private readonly rootsSource;
    constructor(ctx: Context, config: SandboxedFileSystemConfig, rootsSource: WhitelistRoots);
    checkedTarget(target: FsTarget, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsTarget>;
}
export declare const name = "dsh-whitelist-sandbox";
/** Runs after the sandbox stack this plugin builds on is mounted. */
export declare const inject: string[];
/** This plugin's profile entry id — also the settings namespace the client
 * `configForms.get(...)` reads. It must match the row id of whatever patch
 * layer mounts this plugin (the extension registers the package as a profile
 * bundle, whose `cordis.patch.yml` inserts exactly this id). */
export declare const SETTINGS_ENTRY = "dsh-whitelist-sandbox";
/** Plugin config: extra writable roots, a volatile field so the settings page
 * can edit it live without remounting the plugin. */
export interface WhitelistConfig {
    extraWritableRoots: Volatile<string[]>;
}
/** Runtime schema for {@link WhitelistConfig}. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    extraWritableRoots: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    extraWritableRoots: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
}>>, "plain">;
export declare function apply(ctx: Context, config: WhitelistConfig): void;
