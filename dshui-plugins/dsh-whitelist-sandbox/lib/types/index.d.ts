import type { Context, Volatile } from '@deepseek-ai/cordis';
import type { ConfinedArgv, SandboxExecutionPolicy, SandboxPolicy } from '@deepseek-ai/dsh-sandbox';
import type { FsTarget } from '@deepseek-ai/dsh-fs';
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox';
import type { Config as SandboxedFileSystemConfig } from '@deepseek-ai/dsh-fs-sandbox';
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox';
import type { Config as SandboxBashConfig } from '@deepseek-ai/dsh-bash-sandbox';
import z from '@deepseek-ai/schemastery';
import { CommandWhitelist } from './command-whitelist.ts';
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
 * grants per-workspace write SIDs only, so extra roots cannot be enforced, and
 * the mounted shell there is `pwsh-sandbox`, not the bash executor this plugin
 * replaces. */
export declare function assertSupportedWhitelistPlatform(roots: readonly string[], commands?: readonly string[]): void;
/** Logger surface the whitelist sources use; a cordis logger satisfies it
 * (`debug` is optional so test fakes can omit it). */
export interface WhitelistLogger {
    warn(message: string): void;
    error(message: string): void;
    debug?(message: string): void;
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
/** The resolved spec/result types of the shell seam, taken from the stock
 * executor's own signature: `@deepseek-ai/dsh-shell` is a transitive package
 * this plugin does not depend on directly, and these aliases keep the override
 * structurally identical to the base method. */
type BashExecSpec = Parameters<SandboxBashExecutor['execute']>[0];
type BashExecution = Awaited<ReturnType<SandboxBashExecutor['execute']>>;
/**
 * bash side: keeps the stock wrap, injects the extra grants into the selected
 * runner's argv, and routes wholly-whitelisted command lines through the
 * inherited local executor (the stock `danger-full-access` path) instead of the
 * sandbox. Constructing it registers `ctx.shell` (Service name chain).
 */
export declare class WhitelistBashExecutor extends SandboxBashExecutor {
    private readonly rootsSource;
    private readonly commands;
    private readonly logger;
    constructor(ctx: Context, config: SandboxBashConfig, rootsSource: WhitelistRoots, commands: CommandWhitelist, logger: WhitelistLogger | undefined);
    /**
     * Route one resolved call. A command line wholly covered by the command
     * whitelist runs on the inherited local executor — the same code path the
     * stock executor uses under `danger-full-access` — so it is genuinely
     * unconfined and its result carries no `sandbox` facts. A line with file
     * redirects must additionally pass the writable-root target check. Everything
     * else, including every mode the whitelist does not cover, keeps the stock
     * confinement and its result facts.
     * @param spec - the fully-specified spec from {@link SandboxBashExecutor.resolve}.
     * @returns the prepared handle from whichever side runs the command.
     */
    execute(spec: BashExecSpec): Promise<BashExecution>;
    /**
     * Decide whether one call may run outside the sandbox: every simple command
     * must match an entry, and every file redirect must point into a writable
     * area. Effect-free redirects (`/dev/null`, fd duplication/close) are always
     * fine; a file redirect is only judged on a single simple command, because a
     * compound line's earlier segments could create a symlink or change the cwd
     * before the redirecting segment runs.
     * @param spec - the resolved call.
     * @param policy - the call's sandbox policy (workspace root and extra roots).
     * @returns true when the whole line is exempt.
     */
    private exemptFromSandbox;
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
/** Plugin config: the two operator-owned whitelists, both volatile fields so
 * the settings page can edit them live without remounting the plugin. */
export interface WhitelistConfig {
    /** Extra writable roots under `workspace-write` (bash and fs both honor them). */
    extraWritableRoots: Volatile<string[]>;
    /** Command prefixes whose bash invocations run on the host, outside the sandbox. */
    unsandboxedCommands: Volatile<string[]>;
}
/** Runtime schema for {@link WhitelistConfig}. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    extraWritableRoots: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    unsandboxedCommands: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    extraWritableRoots: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    unsandboxedCommands: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
}>>, "plain">;
export declare function apply(ctx: Context, config: WhitelistConfig): void;
export {};
