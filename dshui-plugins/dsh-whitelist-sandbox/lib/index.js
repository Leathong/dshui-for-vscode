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
 * ── Configuration ─────────────────────────────────────────────────────────
 * Two layers, both validated by the same schema (`extraWritableRoots`):
 *   1. The composition row config (`patch.yml` → `dsh-whitelist-sandbox`
 *      row), read at boot. Unsafe values FAIL the plugin load (loud).
 *   2. A live settings section (`$DSH_HOME/settings.yaml`, hot-reloaded):
 *      ```yaml
 *      sandbox-whitelist:
 *        extraWritableRoots: [/extra/path/one, /extra/path/two]
 *      ```
 *      The settings layer merges over the composition base. A change that
 *      fails the security guard is REJECTED with a loud log and the previous
 *      whitelist is kept (fail closed); it never bricks the document.
 *
 * ── Security guard (jailbreak containment) ────────────────────────────────
 * The model must never be able to modify its own sandbox policy. `$DSH_HOME`
 * holds exactly that state — `settings.yaml` (hot-reloaded), credentials,
 * session logs. A whitelist root that lexically contains `settings.yaml` or
 * `$DSH_HOME` would let a prompt-injected/jailbroken model rewrite the
 * policy document (self-extend the whitelist, no approval, no restart), so
 * such roots are rejected on BOTH configuration paths. This keeps the stock
 * invariant — policy state lives outside the model's writable set — intact
 * even when the operator widens the sandbox.
 *
 * ── Boundaries (honest limits) ────────────────────────────────────────────
 *  - The persistent terminal backend (`dsh-terminal-bash`) confines through
 *    `ctx.sandbox` directly and is NOT covered; it is not mounted in the web
 *    profile.
 *  - Windows is unsupported for extra roots: the ACL restricted-token runner
 *    grants per-workspace write SIDs only, so any non-empty whitelist is
 *    rejected (boot config fails load; settings changes keep last-good).
 *  - A configured root that does not exist grants nothing (the fence's
 *    containment is lexical/identity based and the profile grants are
 *    no-ops); bwrap mounts are skipped for missing roots because a missing
 *    `--bind` source fails the whole command.
 *  - Running dsh with a session workspace that itself contains `$DSH_HOME`
 *    already exposes settings to the model independent of this plugin; the
 *    guard covers the whitelist-induced path, not that pre-existing one.
 */
import { stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
import { FsError } from "@deepseek-ai/dsh-fs";
import { SandboxedFileSystem } from "@deepseek-ai/dsh-fs-sandbox";
import { SandboxBashExecutor } from "@deepseek-ai/dsh-bash-sandbox";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";

// #region containment (mirrors @deepseek-ai/dsh-fs-sandbox's internal helper)
/** Path-containment mechanics mirrored from `dsh-fs-sandbox` so the whitelist
 * fallback and the security guard use the exact same lexical/identity
 * semantics as the stock fence. */
const MISSING_CODES = new Set(["ENOENT", "ENOTDIR"]);
function isMissing(error) {
	const code = error.code;
	return MISSING_CODES.has(code);
}
function comparablePath(path, caseSensitive) {
	return caseSensitive ? path : path.toLowerCase();
}
function isLexicallyUnder(path, root, caseSensitive) {
	const comparableTarget = comparablePath(path, caseSensitive);
	const comparableRoot = comparablePath(root, caseSensitive);
	if (comparableTarget === comparableRoot) return true;
	const prefix = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
	return comparableTarget.startsWith(prefix);
}
async function statIfPresent(path) {
	try {
		return await stat(path, { bigint: true });
	} catch (error) {
		if (isMissing(error)) return void 0;
		throw error;
	}
}
function sameIdentity(left, right) {
	return left.dev === right.dev && left.ino === right.ino;
}
async function isPathUnder(path, root, caseSensitive = process.platform !== "win32") {
	if (isLexicallyUnder(path, root, caseSensitive)) return true;
	const rootInfo = await statIfPresent(root);
	if (!rootInfo) return false;
	let ancestor = path;
	while (true) {
		const ancestorInfo = await statIfPresent(ancestor);
		if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo)) return true;
		const parent = dirname(ancestor);
		if (parent === ancestor) return false;
		ancestor = parent;
	}
}
// #endregion

/** Quote one path as an SBPL string literal (same escaping as the stock profile builder). */
function sbplString(path) {
	return `"${path.replaceAll("\\", String.raw`\\`).replaceAll("\"", String.raw`\"`)}"`;
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
	if (extraRoots.length === 0) return argv;
	const existing = extraRoots.filter((root) => existsSync(root));
	if (existing.length === 0) return argv;
	const sepIndex = argv.indexOf("--");
	// Seatbelt: sandbox-exec -p <profile> -- ...
	if (argv[1] === "-p" && typeof argv[2] === "string") {
		const extra = existing.map((root) => `(allow file-write* (subpath ${sbplString(root)}))`).join(" ");
		const copy = argv.slice();
		copy[2] = `${argv[2]} ${extra}`;
		return copy;
	}
	// bwrap: ... --tmpfs /tmp --bind <ws> <ws> -- ...
	if (argv[0] === "bwrap") {
		const grants = existing.flatMap((root) => ["--bind", root, root]);
		const copy = argv.slice();
		copy.splice(sepIndex === -1 ? copy.length : sepIndex, 0, ...grants);
		return copy;
	}
	// Landlock launcher: [launcher, --ro <root> ..., --rw <root> ..., "--", ...]
	if (sepIndex !== -1 && argv.slice(1, sepIndex).some((arg) => arg === "--ro" || arg === "--rw")) {
		const grants = existing.flatMap((root) => ["--rw", root]);
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
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const raw of roots ?? []) {
		const canonical = canonicalPath(raw);
		if (seen.has(canonical)) continue;
		seen.add(canonical);
		if (!existsSync(canonical)) {
			logger?.warn?.(`dsh-whitelist-sandbox: whitelist root ${JSON.stringify(raw)} (canonical ${JSON.stringify(canonical)}) does not exist; it grants nothing until it exists`);
		}
		out.push(canonical);
	}
	return out;
}

/**
 * The security guard: a whitelist root must never make the DSH policy state
 * writable. `$DSH_HOME` holds the hot-reloaded `settings.yaml`, credentials,
 * and session logs — if a root lexically contains them, a jailbroken model
 * could rewrite the policy document and widen its own sandbox. Throws on the
 * first offending root (callers decide: fail load or keep-last-good).
 * @param roots - canonical whitelist roots.
 * @param store - canonical settings-document path and harness home.
 */
export function assertSafeWhitelistRoots(roots, { settingsPath, dshHome }) {
	for (const root of roots) {
		if (isLexicallyUnder(dshHome, root)) {
			throw new Error(`whitelist root ${JSON.stringify(root)} would make the DSH home writable (${dshHome}); a jailbroken model could rewrite settings/credentials/session state to widen its own sandbox — refusing`);
		}
		if (isLexicallyUnder(settingsPath, root)) {
			throw new Error(`whitelist root ${JSON.stringify(root)} would make the DSH settings/policy document writable (${settingsPath}); a jailbroken model could rewrite it to widen its own sandbox — refusing`);
		}
	}
}

/**
 * Live whitelist source: holds the currently-applied canonical roots and
 * revalidates every write through the canonicalization + security guard. Both
 * enforcement sides read `roots` per call, so a settings hot-reload applies
 * immediately without restarting anything.
 */
export class WhitelistRoots {
	constructor(logger, { settingsPath, dshHome }) {
		this.logger = logger;
		this.settingsPath = settingsPath;
		this.dshHome = dshHome;
		this.value = [];
	}
	/** The currently applied canonical extra roots. */
	get roots() {
		return this.value;
	}
	/**
	 * Apply a new raw root list: canonicalize, run the security guard, then
	 * commit. Throws on an unsafe or (on Windows) non-empty list, leaving the
	 * previous value intact — the caller decides whether that fails load or
	 * keeps last-good.
	 */
	apply(rawRoots) {
		const canonical = canonicalizeExtraRoots(rawRoots, this.logger);
		assertSafeWhitelistRoots(canonical, { settingsPath: this.settingsPath, dshHome: this.dshHome });
		if (canonical.length > 0 && process.platform === "win32") {
			throw new Error("extraWritableRoots is not supported on Windows yet (the ACL restricted-token runner grants per-workspace write SIDs only); remove extraWritableRoots or run on macOS/Linux");
		}
		this.value = canonical;
		return canonical;
	}
}

/**
 * bash side: keeps the stock wrap, injects the extra grants into the selected
 * runner's argv. Constructing it registers `ctx.shell` (Service name chain).
 */
export class WhitelistBashExecutor extends SandboxBashExecutor {
	constructor(ctx, config, rootsSource) {
		super(ctx, config);
		this.rootsSource = rootsSource;
	}
	confine(command, policy) {
		const confined = super.confine(command, policy);
		const extraRoots = this.rootsSource.roots;
		if (extraRoots.length === 0) return confined;
		const argv = injectExtraRootGrants(confined.argv, extraRoots);
		if (argv === confined.argv) return confined;
		return { ...confined, argv };
	}
}

/**
 * fs side: when the stock fence denies under workspace-write, fall back to the
 * whitelist containment. Constructing it registers `ctx.fs` (Service name
 * chain). Denials for non-whitelisted targets keep the structured
 * `FS_SANDBOX_DENIED` the tool layer maps to the model-facing marker.
 */
export class WhitelistFileSystem extends SandboxedFileSystem {
	constructor(ctx, config, rootsSource) {
		super(ctx, config);
		this.rootsSource = rootsSource;
	}
	async checkedTarget(target, sandboxPolicy) {
		const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
		const extraRoots = this.rootsSource.roots;
		if (policy.mode !== "workspace-write" || extraRoots.length === 0) {
			return super.checkedTarget(target, sandboxPolicy);
		}
		try {
			return await super.checkedTarget(target, sandboxPolicy);
		} catch (error) {
			if (!(error instanceof FsError) || error.code !== "FS_SANDBOX_DENIED") throw error;
			const fresh = await this.resolve(target.displayPath);
			for (const root of extraRoots) {
				if (await isPathUnder(fresh.targetKey, root)) return fresh;
			}
			throw error;
		}
	}
}

export const name = "dsh-whitelist-sandbox";

/** Runs after the sandbox stack this plugin builds on is mounted. */
export const inject = ["subprocess", "sandbox", "sandboxPolicy"];

/** Shared schema for the composition row config and the live settings section. */
const WhitelistConfigSchema = z.object({
	extraWritableRoots: z.array(z.string()).default([])
});
export const Config = WhitelistConfigSchema;

/** `$DSH_HOME/settings.yaml` top-level section key for this plugin. */
const SETTINGS_NAMESPACE = settingsNamespace("sandbox-whitelist");

/**
 * Live settings layer: the `sandbox-whitelist:` section of settings.yaml
 * merges over the composition base. Guard failures keep the previous roots
 * with a loud error — never brick the document, never widen unsafely.
 */
function installWhitelistSettings(ctx, rootsSource, baseEntry) {
	let source = () => baseEntry;
	installSettingsSection(ctx, SETTINGS_NAMESPACE, WhitelistConfigSchema, baseEntry, {
		setSource: (fn) => {
			source = fn;
		},
		onChange: () => {
			const section = source();
			try {
				rootsSource.apply(section.extraWritableRoots);
			} catch (error) {
				ctx.logger.error(`dsh-whitelist-sandbox: rejected settings update (${error.message}); keeping the previous whitelist`);
			}
		}
	});
}

export function apply(ctx, config) {
	const dshHome = canonicalPath(resolveDshHome());
	const settingsPath = canonicalPath(join(dshHome, "settings.yaml"));
	const rootsSource = new WhitelistRoots(ctx.logger, { settingsPath, dshHome });
	// Boot-time composition config: unsafe roots fail the plugin load loudly.
	rootsSource.apply(config.extraWritableRoots);
	// Same config the stock `bash-sandbox` row carried; constructing the
	// subclasses registers ctx.shell and ctx.fs on this plugin's fiber.
	const executorConfig = SandboxBashExecutor.Config({ timeoutMs: 6e4 });
	new WhitelistBashExecutor(ctx, executorConfig, rootsSource);
	new WhitelistFileSystem(ctx, SandboxedFileSystem.Config({}), rootsSource);
	// Live settings layer (hot-reloaded); merges over the composition base.
	installWhitelistSettings(ctx, rootsSource, config);
	// The stock policy context names only workspaceRoot; advertise the live
	// whitelist so the model knows the additional writable range.
	ctx.inject(["systemPrompt"], (scope) => {
		scope.systemPrompt.context({
			name: "whitelist:extra-roots",
			order: 115,
			text: () => {
				const roots = rootsSource.roots;
				return roots.length > 0 ? `Additional writable paths (whitelist): ${roots.join(", ")}` : "";
			}
		});
	});
	const applied = rootsSource.roots;
	ctx.logger?.info?.(`dsh-whitelist-sandbox: ${applied.length} extra writable root(s)${applied.length > 0 ? ` (${applied.join(", ")})` : ""}`);
}
