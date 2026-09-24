/**
 * dsh-whitelist-sandbox
 *
 * Additive writable-path whitelist for the DSH sandbox under `workspace-write`.
 *
 * The stock policy's writable set is exactly workspaceRoot + /tmp +
 * os.tmpdir() (the `writableRoots` derivation in `@deepseek-ai/dsh-sandbox`),
 * shared by every enforcement dialect so bash and the fs tools cannot drift
 * apart. This plugin adds operator-configured extra roots to BOTH sides,
 * preserving that symmetry:
 *
 *  - ctx.shell: a `SandboxBashExecutor` subclass whose `confine()` keeps the
 *    stock provider's wrap — runner selection, denial dialects, and
 *    runner-failure rules are all inherited — and injects the extra grants
 *    into the selected runner's argv: Seatbelt `(allow file-write* (subpath
 *    ...))` forms, bwrap `--bind` pairs, or Landlock `--rw` roots.
 *  - ctx.fs: a `SandboxedFileSystem` subclass whose `checkedTarget()` falls
 *    back to the whitelist containment when the stock fence denies.
 *
 * The stock `sandbox` provider and `sandboxPolicy` service stay mounted; the
 * plugin replaces only the two consuming rows (`bash-sandbox`, `fs-sandbox`)
 * via the composition patch (disabled rows + a fresh plugin row), so denial
 * markers, per-call mode stamping, and the `sandbox_permissions` escalation
 * channel behave exactly as stock.
 *
 * ── Configuration (dsh 0.1.7) ─────────────────────────────────────────────
 * One source: this plugin's own profile entry config (`extraWritableRoots`),
 * declared as a schemastery `volatile()` field. The settings page edits that
 * entry live through the client `configForms` service; the loader swaps the
 * volatile reference in place, so nothing remounts and both enforcement sides
 * read the new roots on their next call. An unsafe write is refused BEFORE it
 * persists by the `internal/config` waterfall registered in `apply`, so the
 * policy document never holds a widened root.
 *
 * ── Security guard (jailbreak containment) ────────────────────────────────
 * The model must never be able to modify its own sandbox policy. `$DSH_HOME`
 * holds exactly that state — the profile patch document the settings page
 * writes, credentials, session logs. A whitelist root that lexically contains
 * `$DSH_HOME` (or the live settings document) would let a prompt-injected/
 * jailbroken model rewrite the policy document and self-extend the whitelist,
 * so such roots are refused on write (`internal/config`) and again on every
 * read. The read-time refusal keeps the last good whitelist and never fails
 * the plugin load: an unsafe value already present in the document must not
 * strip `shell`/`fs` from the whole tree by failing this row.
 *
 * ── Boundaries (honest limits) ────────────────────────────────────────────
 *  - The persistent terminal backend (`dsh-terminal-bash`) confines through
 *    `ctx.sandbox` directly and is NOT covered; it is not mounted in the web
 *    profile.
 *  - Windows is unsupported for extra roots: the ACL restricted-token runner
 *    grants per-workspace write SIDs only, so any non-empty whitelist is
 *    refused on write and at read time (keep-last-good; never fails load).
 *  - A configured root that does not exist grants nothing (the fence's
 *    containment is lexical/identity based and the profile grants are
 *    no-ops); bwrap mounts are skipped for missing roots because a missing
 *    `--bind` source fails the whole command.
 *  - Running dsh with a session workspace that itself contains `$DSH_HOME`
 *    already exposes settings to the model independent of this plugin; the
 *    guard covers the whitelist-induced path, not that pre-existing one.
 */
import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { canonicalPath } from '@deepseek-ai/dsh-sandbox';
import { FsError } from '@deepseek-ai/dsh-fs';
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox';
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox';
import { LocalBashExecutor } from '@deepseek-ai/dsh-bash-local';
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import z from '@deepseek-ai/schemastery';
// #region containment (mirrors @deepseek-ai/dsh-fs-sandbox's internal helper)
/** Path-containment mechanics mirrored from `dsh-fs-sandbox` so the whitelist
 * fallback and the security guard use the exact same lexical/identity
 * semantics as the stock fence. */
const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR']);
function isMissing(error) {
    const code = error.code;
    return typeof code === 'string' && MISSING_CODES.has(code);
}
function comparablePath(path, caseSensitive) {
    return caseSensitive ? path : path.toLowerCase();
}
function isLexicallyUnder(path, root, caseSensitive) {
    const comparableTarget = comparablePath(path, caseSensitive);
    const comparableRoot = comparablePath(root, caseSensitive);
    if (comparableTarget === comparableRoot)
        return true;
    const prefix = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
    return comparableTarget.startsWith(prefix);
}
async function statIfPresent(path) {
    try {
        return await stat(path, { bigint: true });
    }
    catch (error) {
        if (isMissing(error))
            return void 0;
        throw error;
    }
}
function sameIdentity(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}
async function isPathUnder(path, root, caseSensitive = process.platform !== 'win32') {
    if (isLexicallyUnder(path, root, caseSensitive))
        return true;
    const rootInfo = await statIfPresent(root);
    if (!rootInfo)
        return false;
    let ancestor = path;
    while (true) {
        const ancestorInfo = await statIfPresent(ancestor);
        if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo))
            return true;
        const parent = dirname(ancestor);
        if (parent === ancestor)
            return false;
        ancestor = parent;
    }
}
// #endregion
/** Quote one path as an SBPL string literal (same escaping as the stock profile builder). */
function sbplString(path) {
    return `"${path.replaceAll('\\', String.raw `\\`).replaceAll('"', String.raw `\"`)}"`;
}
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
export function injectExtraRootGrants(argv, extraRoots) {
    if (extraRoots.length === 0)
        return argv;
    const existing = extraRoots.filter((root) => existsSync(root));
    if (existing.length === 0)
        return argv;
    const sepIndex = argv.indexOf('--');
    // Seatbelt: sandbox-exec -p <profile> -- ...
    if (argv[1] === '-p' && typeof argv[2] === 'string') {
        const extra = existing.map((root) => `(allow file-write* (subpath ${sbplString(root)}))`).join(' ');
        const copy = argv.slice();
        copy[2] = `${argv[2]} ${extra}`;
        return copy;
    }
    // bwrap: ... --tmpfs /tmp --bind <ws> <ws> -- ...
    if (argv[0] === 'bwrap') {
        const grants = existing.flatMap((root) => ['--bind', root, root]);
        const copy = argv.slice();
        copy.splice(sepIndex === -1 ? copy.length : sepIndex, 0, ...grants);
        return copy;
    }
    // Landlock launcher: [launcher, --ro <root> ..., --rw <root> ..., "--", ...]
    if (sepIndex !== -1 && argv.slice(1, sepIndex).some((arg) => arg === '--ro' || arg === '--rw')) {
        const grants = existing.flatMap((root) => ['--rw', root]);
        const copy = argv.slice();
        copy.splice(sepIndex, 0, ...grants);
        return copy;
    }
    return argv;
}
/**
 * Canonicalize the configured whitelist roots: realpath when possible (so the
 * grants match the fence's canonical comparisons), deduplicated, warning on
 * roots that currently do not exist.
 */
export function canonicalizeExtraRoots(roots, logger) {
    const seen = new Set();
    const out = [];
    for (const raw of roots ?? []) {
        const canonical = canonicalPath(raw);
        if (seen.has(canonical))
            continue;
        seen.add(canonical);
        if (!existsSync(canonical)) {
            logger?.warn(`dsh-whitelist-sandbox: whitelist root ${JSON.stringify(raw)} (canonical ${JSON.stringify(canonical)}) does not exist; it grants nothing until it exists`);
        }
        out.push(canonical);
    }
    return out;
}
/**
 * The security guard: a whitelist root must never make the DSH policy state
 * writable. `$DSH_HOME` holds the profile patch document the settings page
 * writes, credentials, and session logs — if a root lexically contains them, a
 * jailbroken model could rewrite the policy document and widen its own
 * sandbox. Throws on the first offending root.
 * @param roots - canonical whitelist roots.
 * @param store - the live settings-document path and harness home.
 */
export function assertSafeWhitelistRoots(roots, store) {
    for (const root of roots) {
        if (isLexicallyUnder(store.dshHome, root, process.platform !== 'win32')) {
            throw new Error(`whitelist root ${JSON.stringify(root)} would make the DSH home writable (${store.dshHome}); a jailbroken model could rewrite settings/credentials/session state to widen its own sandbox — refusing`);
        }
        if (isLexicallyUnder(store.settingsPath, root, process.platform !== 'win32')) {
            throw new Error(`whitelist root ${JSON.stringify(root)} would make the DSH settings/policy document writable (${store.settingsPath}); a jailbroken model could rewrite it to widen its own sandbox — refusing`);
        }
    }
}
/** Reject a non-empty whitelist on Windows: the ACL restricted-token runner
 * grants per-workspace write SIDs only, so extra roots cannot be enforced. */
export function assertSupportedWhitelistPlatform(roots) {
    if (roots.length > 0 && process.platform === 'win32') {
        throw new Error('extraWritableRoots is not supported on Windows yet (the ACL restricted-token runner grants per-workspace write SIDs only); remove extraWritableRoots or run on macOS/Linux');
    }
}
/**
 * Live whitelist source over a schemastery `volatile()` reference: both
 * enforcement sides read `roots` per call, so a settings hot-reload applies
 * immediately without restarting anything. Every read re-runs canonicalization
 * and the security guard; a rejected value is logged loudly and the previous
 * good whitelist is kept, so a bad stored value can neither widen the sandbox
 * nor fail the plugin load.
 */
export class WhitelistRoots {
    read;
    store;
    logger;
    lastRaw;
    value = [];
    constructor(read, store, logger) {
        this.read = read;
        this.store = store;
        this.logger = logger;
        this.refresh();
    }
    /** The currently applied canonical extra roots. */
    get roots() {
        const raw = this.read();
        if (raw !== this.lastRaw)
            this.refresh();
        return this.value;
    }
    /**
     * Recompute the effective roots from the current volatile value. The
     * volatile reference is a frozen snapshot the loader swaps wholesale, so an
     * identity change is exactly "the operator changed the configuration".
     * A guard failure keeps the previous value (fail closed, never brick).
     */
    refresh() {
        const raw = this.read() ?? [];
        this.lastRaw = raw;
        try {
            const canonical = canonicalizeExtraRoots(raw, this.logger);
            assertSafeWhitelistRoots(canonical, this.store);
            assertSupportedWhitelistPlatform(canonical);
            this.value = canonical;
        }
        catch (error) {
            this.logger?.error(`dsh-whitelist-sandbox: refusing ${JSON.stringify(raw)} (${error.message}); keeping the previous whitelist`);
        }
    }
}
/**
 * bash side: keeps the stock wrap, injects the extra grants into the selected
 * runner's argv. Constructing it registers `ctx.shell` (Service name chain).
 */
// The stock base marks `confine` private, so TypeScript's nominal-private
// check rejects this override as a "separate declaration" (TS2415). The runtime
// is plain prototype dispatch, so the override is valid; the inherited
// implementation is reached through the prototype (identical semantics to
// `super.confine`, which TS also forbids on a private base). This is the honest
// escape hatch for that modeling gap.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error TS2415: base `confine` is private; runtime override is valid.
export class WhitelistBashExecutor extends SandboxBashExecutor {
    rootsSource;
    constructor(ctx, config, rootsSource) {
        super(ctx, config);
        this.rootsSource = rootsSource;
    }
    async confine(command, policy, signal) {
        const base = SandboxBashExecutor.prototype;
        const confined = await base.confine.call(this, command, policy, signal);
        const extraRoots = this.rootsSource.roots;
        if (extraRoots.length === 0)
            return confined;
        const argv = injectExtraRootGrants(confined.argv, extraRoots);
        if (argv === confined.argv)
            return confined;
        return { ...confined, argv };
    }
}
/**
 * fs side: when the stock fence denies under workspace-write, fall back to the
 * whitelist containment. Constructing it registers `ctx.fs` (Service name
 * chain). Denials for non-whitelisted targets keep the structured
 * `FS_SANDBOX_DENIED` the tool layer maps to the model-facing marker.
 */
// Same nominal-private gap as `WhitelistBashExecutor.confine` (see above).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error TS2415: base `checkedTarget` is private; runtime override is valid.
export class WhitelistFileSystem extends SandboxedFileSystem {
    rootsSource;
    constructor(ctx, config, rootsSource) {
        super(ctx, config);
        this.rootsSource = rootsSource;
    }
    async checkedTarget(target, sandboxPolicy) {
        const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
        const extraRoots = this.rootsSource.roots;
        if (policy.mode !== 'workspace-write' || extraRoots.length === 0) {
            const base = SandboxedFileSystem.prototype;
            return base.checkedTarget.call(this, target, sandboxPolicy);
        }
        const base = SandboxedFileSystem.prototype;
        try {
            return await base.checkedTarget.call(this, target, sandboxPolicy);
        }
        catch (error) {
            if (!(error instanceof FsError) || error.code !== 'FS_SANDBOX_DENIED')
                throw error;
            const fresh = await this.resolve(target.displayPath);
            for (const root of extraRoots) {
                if (await isPathUnder(fresh.targetKey, root))
                    return fresh;
            }
            throw error;
        }
    }
}
export const name = 'dsh-whitelist-sandbox';
/** Runs after the sandbox stack this plugin builds on is mounted. */
export const inject = ['subprocess', 'sandbox', 'sandboxPolicy'];
/** This plugin's profile entry id — also the settings namespace the client
 * `configForms.get(...)` reads. It must match the row id of whatever patch
 * layer mounts this plugin (the extension registers the package as a profile
 * bundle, whose `cordis.patch.yml` inserts exactly this id). */
export const SETTINGS_ENTRY = 'dsh-whitelist-sandbox';
/** Runtime schema for {@link WhitelistConfig}. */
export const Config = z.object({
    extraWritableRoots: z.array(z.string()).default([]).volatile(),
});
/**
 * Validate a candidate config BEFORE it persists. Registered on the loader's
 * `internal/config` waterfall, which `configEditor.edit` runs before writing
 * the profile patch, so an unsafe root refuses the save and leaves the
 * document untouched. Boot-time composition bypasses this hook (it is
 * registered by `apply`, after the row's own config resolved); the read-time
 * guard in {@link WhitelistRoots} covers that path instead.
 */
function installWhitelistWriteGuard(ctx, store) {
    ctx.on('internal/config', function (_config, next) {
        const raw = next();
        if (this !== ctx.fiber)
            return raw;
        const candidate = Config(raw);
        const canonical = canonicalizeExtraRoots(candidate.extraWritableRoots.get(), ctx.logger);
        assertSafeWhitelistRoots(canonical, store);
        assertSupportedWhitelistPlatform(canonical);
        return raw;
    });
}
export function apply(ctx, config) {
    const dshHome = canonicalPath(resolveDshHome());
    const store = { settingsPath: canonicalPath(join(dshHome, 'settings.yaml')), dshHome };
    const rootsSource = new WhitelistRoots(() => config.extraWritableRoots.get(), store, ctx.logger);
    // Same config the stock `bash-sandbox` row carried; constructing the
    // subclasses registers ctx.shell and ctx.fs on this plugin's fiber.
    new WhitelistBashExecutor(ctx, LocalBashExecutor.Config({ timeoutMs: 6e4 }), rootsSource);
    new WhitelistFileSystem(ctx, LocalFileSystem.Config({}), rootsSource);
    // Refuse an unsafe write before it persists, and keep the guard pointed at
    // the live settings/policy document once the settings service is available.
    installWhitelistWriteGuard(ctx, store);
    ctx.inject(['settings'], (scope) => {
        scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber));
        store.settingsPath = canonicalPath(scope.settings.documentPath);
    });
    // The stock policy context names only workspaceRoot; advertise the live
    // whitelist so the model knows the additional writable range.
    ctx.inject(['systemPrompt'], (scope) => {
        scope.systemPrompt.context({
            name: 'whitelist:extra-roots',
            order: 115,
            text: () => {
                const roots = rootsSource.roots;
                return roots.length > 0 ? `Additional writable paths (whitelist): ${roots.join(', ')}` : '';
            },
        });
    });
    const applied = rootsSource.roots;
    ctx.logger.info(`dsh-whitelist-sandbox: ${applied.length} extra writable root(s)${applied.length > 0 ? ` (${applied.join(', ')})` : ''}`);
}
