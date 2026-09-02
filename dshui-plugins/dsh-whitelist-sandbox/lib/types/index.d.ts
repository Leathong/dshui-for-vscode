import type { Context } from '@deepseek-ai/cordis';
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
 * writable. `$DSH_HOME` holds the hot-reloaded `settings.yaml`, credentials,
 * and session logs — if a root lexically contains them, a jailbroken model
 * could rewrite the policy document and widen its own sandbox. Throws on the
 * first offending root (callers decide: fail load or keep-last-good).
 * @param roots - canonical whitelist roots.
 * @param store - canonical settings-document path and harness home.
 */
export declare function assertSafeWhitelistRoots(roots: readonly string[], store: {
    settingsPath: string;
    dshHome: string;
}): void;
/**
 * Live whitelist source: holds the currently-applied canonical roots and
 * revalidates every write through the canonicalization + security guard. Both
 * enforcement sides read `roots` per call, so a settings hot-reload applies
 * immediately without restarting anything.
 */
export declare class WhitelistRoots {
    private readonly logger;
    private readonly store;
    private value;
    constructor(logger: {
        warn(message: string): void;
    } | undefined, store: {
        settingsPath: string;
        dshHome: string;
    });
    /** The currently applied canonical extra roots. */
    get roots(): string[];
    /**
     * Apply a new raw root list: canonicalize, run the security guard, then
     * commit. Throws on an unsafe or (on Windows) non-empty list, leaving the
     * previous value intact — the caller decides whether that fails load or
     * keeps last-good.
     */
    apply(rawRoots: readonly string[]): string[];
}
/**
 * bash side: keeps the stock wrap, injects the extra grants into the selected
 * runner's argv. Constructing it registers `ctx.shell` (Service name chain).
 */
export declare class WhitelistBashExecutor extends SandboxBashExecutor {
    private readonly rootsSource;
    constructor(ctx: Context, config: SandboxBashConfig, rootsSource: WhitelistRoots);
    confine(command: string, policy: SandboxPolicy): ConfinedArgv;
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
/** Plugin config (also the live settings section's schema). */
export interface WhitelistConfig {
    extraWritableRoots: string[];
}
export declare const Config: z<Schemastery.ObjectS<{
    extraWritableRoots: z<string[], string[]>;
}>, Schemastery.ObjectT<{
    extraWritableRoots: z<string[], string[]>;
}>>;
export declare function apply(ctx: Context, config: WhitelistConfig): void;
