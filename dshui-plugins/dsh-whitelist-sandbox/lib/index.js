import { lstat, realpath, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
import { FsError } from "@deepseek-ai/dsh-fs";
import { SandboxedFileSystem } from "@deepseek-ai/dsh-fs-sandbox";
import { SandboxBashExecutor } from "@deepseek-ai/dsh-bash-sandbox";
import { LocalBashExecutor } from "@deepseek-ai/dsh-bash-local";
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
import { tmpdir } from "node:os";
//#region lib/types/command-whitelist.js
/**
* Command whitelist mechanics for the bash executor: decide whether one raw
* `bash -c` source may run directly on the host instead of through
* `ctx.sandbox`.
*
* ── Security model ────────────────────────────────────────────────────────
* This is a *conservative* prefix whitelist. Eligibility is decided by a
* purpose-built scanner, not by bash itself, so every construct the scanner
* does not understand disqualifies the WHOLE command line and it stays
* sandboxed (fail closed). That means:
*
*  - A compound line is split into its simple commands; EVERY one of them must
*    match an entry. One non-whitelisted segment keeps the whole line
*    sandboxed (the caller's chosen semantics: "全部匹配就放行").
*  - Only `;`, `&&`, `||`, `|` and newlines are accepted as separators.
*    Background jobs (`&`), subshells/groups (`(`, `)`, `{`, `}`), comments
*    (`#`), backslash escapes, and any `$` expansion or backtick (which could
*    hide command substitution) are refused outright.
*  - Redirections are parsed and classified, not judged here: the shell — not
*    the whitelisted program — performs a redirection, so a file target is an
*    unconfined read/write primitive. `/dev/null` and file-descriptor
*    duplication/close have no file effect and never block the exemption; a
*    file target is handed to the executor's asynchronous writable-root check
*    (single simple commands only). Entries themselves may not contain
*    redirects at all.
*  - Quotes are honored (the entry and the command are compared as argv
*    tokens, not as raw text), but nothing inside a command is ever evaluated
*    here.
*
* An entry matches one simple command when its tokens are an exact prefix of
* that command's argv tokens (`git` matches `git status -sb`; `git status`
* matches `git status --porcelain` but not `git log`). The command word is
* compared verbatim, so `/usr/bin/git …` never matches the entry `git`.
*
* ── Entries that are refused ──────────────────────────────────────────────
* Shells and pure command forwarders (`bash`, `env`, `xargs`, `sudo`, …) can
* never express a command-level whitelist: they forward an arbitrary command
* the caller chooses, silently granting full unsandboxed access. Those entries
* are rejected with an explicit error (use the permission mode instead).
* Interpreters such as `node`/`python` are legitimate build tools and are
* accepted, but they are equally broad: the settings page and README warn that
* whitelisting one is a full trust decision.
*/
/**
* First-token programs whose purpose is forwarding another command or shell.
* An entry naming one of these would grant an arbitrary command, so it is
* rejected at entry-validation time. Matched on the lowercased basename, so
* `/bin/Bash` is caught on case-insensitive filesystems too.
*/
const FORWARDERS = new Set([
	"sh",
	"ash",
	"bash",
	"busybox",
	"csh",
	"dash",
	"fish",
	"ksh",
	"mksh",
	"pdksh",
	"tcsh",
	"zsh",
	"env",
	"command",
	"exec",
	"eval",
	"builtin",
	"source",
	"xargs",
	"parallel",
	"sudo",
	"doas",
	"su",
	"runuser",
	"nohup",
	"setsid",
	"stdbuf",
	"timeout",
	"nice",
	"ionice",
	"chroot",
	"nsenter",
	"flock",
	"time",
	"watch"
]);
/** Shell reserved words and operator-like tokens that can never start an
* entry: a command beginning with one of these is handled by the shell, not by
* the named program, so matching it would be meaningless. */
const RESERVED = new Set([
	"!",
	"{",
	"}",
	"if",
	"then",
	"elif",
	"else",
	"fi",
	"for",
	"do",
	"done",
	"while",
	"until",
	"case",
	"esac",
	"in",
	"function",
	"select",
	"coproc",
	"time"
]);
/** Unquoted glob syntax is refused in entries: a glob in the command word is
* expanded by bash before PATH lookup, so the program that actually runs can
* differ from the text that matched. */
const GLOB_CHARACTER$1 = /[*?[\]]/;
function rejection(reason) {
	return {
		ok: false,
		reason
	};
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
function parseCommandLine(raw, options = {}) {
	const allowRedirections = options.allowRedirections !== false;
	const segments = [];
	const redirects = [];
	let segment = [];
	let word = "";
	let inWord = false;
	let wordQuoted = false;
	let quote = null;
	let index = 0;
	const endWord = () => {
		if (!inWord) return;
		segment.push(word);
		word = "";
		inWord = false;
		wordQuoted = false;
	};
	const endSegment = () => {
		endWord();
		segments.push(segment);
		segment = [];
	};
	/**
	* Finish the word in front of a redirection operator. An unquoted all-digit
	* word is bash's IO number (its fd designation), not an argv token, so it is
	* dropped; anything else becomes an ordinary argument.
	*/
	const endWordBeforeRedirect = () => {
		if (inWord && !wordQuoted && /^[0-9]+$/.test(word)) {
			word = "";
			inWord = false;
			return;
		}
		endWord();
	};
	while (index < raw.length) {
		const character = raw[index];
		if (quote === "'") {
			if (character === "'") quote = null;
			else word += character;
			index += 1;
			continue;
		}
		if (quote === "\"") {
			if (character === "\"") {
				quote = null;
				index += 1;
				continue;
			}
			if (character === "\\") return rejection("a backslash escape is not supported");
			if (character === "$") return rejection("a \"$\" expansion is not supported");
			if (character === "`") return rejection("a backtick command substitution is not supported");
			word += character;
			index += 1;
			continue;
		}
		switch (character) {
			case " ":
			case "	":
				endWord();
				index += 1;
				continue;
			case "\n":
				if (segment.length > 0 || inWord) endSegment();
				else endWord();
				index += 1;
				continue;
			case "'":
			case "\"":
				quote = character;
				wordQuoted = true;
				inWord = true;
				index += 1;
				continue;
			case ";":
				endSegment();
				index += 1;
				continue;
			case "|":
				if (raw[index + 1] === "&") return rejection("a \"|&\" pipe is not supported");
				if (raw[index + 1] === "|") index += 1;
				endSegment();
				index += 1;
				continue;
			case "&":
				if (raw[index + 1] === "&") {
					endSegment();
					index += 2;
					continue;
				}
				if (raw[index + 1] === ">") {
					if (!allowRedirections) return rejection("an entry must be one simple command (no redirections)");
					endWord();
					const append = raw[index + 2] === ">";
					const operator = append ? "&>>" : "&>";
					const target = readRedirectTarget(raw, index + (append ? 3 : 2));
					if (!target.ok) return rejection(target.reason);
					redirects.push(classifyRedirect(operator, target));
					index = target.next;
					continue;
				}
				return rejection("background execution (\"&\") is not supported");
			case "#": return rejection("a comment (\"#\") is not supported");
			case "$": return rejection("a \"$\" expansion is not supported");
			case "`": return rejection("a backtick command substitution is not supported");
			case "\\": return rejection("a backslash escape is not supported");
			case ">": {
				if (!allowRedirections) return rejection("an entry must be one simple command (no redirections)");
				endWordBeforeRedirect();
				let operator;
				let after;
				if (raw[index + 1] === ">") {
					operator = ">>";
					after = index + 2;
				} else if (raw[index + 1] === "&") {
					operator = ">&";
					after = index + 2;
				} else if (raw[index + 1] === "|") return rejection("the noclobber redirect \">|\" is not supported");
				else {
					operator = ">";
					after = index + 1;
				}
				const target = readRedirectTarget(raw, after);
				if (!target.ok) return rejection(target.reason);
				redirects.push(classifyRedirect(operator, target));
				index = target.next;
				continue;
			}
			case "<": {
				if (!allowRedirections) return rejection("an entry must be one simple command (no redirections)");
				endWordBeforeRedirect();
				if (raw[index + 1] === "<") return rejection("a heredoc or here-string is not supported");
				if (raw[index + 1] === ">") return rejection("a read/write redirect \"<>\" is not supported");
				const operator = raw[index + 1] === "&" ? "<&" : "<";
				const target = readRedirectTarget(raw, index + operator.length);
				if (!target.ok) return rejection(target.reason);
				redirects.push(classifyRedirect(operator, target));
				index = target.next;
				continue;
			}
			case "(":
			case ")":
			case "{":
			case "}": return rejection(`a subshell or group ("${character}") is not supported`);
			default:
				if (character < " " || character === "") return rejection("a control character is not supported");
				word += character;
				inWord = true;
				index += 1;
				continue;
		}
	}
	if (quote !== null) return rejection("an unterminated quote");
	endSegment();
	while (segments.length > 0 && segments.at(-1).length === 0) segments.pop();
	if (segments.length === 0) return rejection("no command");
	if (segments.some((entry) => entry.length === 0)) return rejection("an empty command between separators");
	for (const entry of segments) if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(entry[0])) return rejection("an environment assignment prefix is not supported");
	return {
		ok: true,
		value: {
			segments,
			redirects
		}
	};
}
/** The null device: the only redirection target with no file effect. */
const NULL_DEVICE = "/dev/null";
/**
* Read the word that follows a redirection operator. Quotes are honored (the
* result is the post-quote-removal token), expansion is refused, and the word
* ends at whitespace or an unquoted shell metacharacter.
* @param raw - the command source.
* @param start - index just after the operator.
* @returns the target token and the index after it, or why it is unusable.
*/
function readRedirectTarget(raw, start) {
	let index = start;
	while (index < raw.length && (raw[index] === " " || raw[index] === "	")) index += 1;
	let token = "";
	let started = false;
	let quoted = false;
	while (index < raw.length) {
		const character = raw[index];
		if (character === " " || character === "	" || character === "\n" || character === ";" || character === "|" || character === "&" || character === "<" || character === ">" || character === "(" || character === ")" || character === "{" || character === "}") break;
		if (character === "'") {
			started = true;
			quoted = true;
			index += 1;
			while (index < raw.length && raw[index] !== "'") {
				token += raw[index];
				index += 1;
			}
			if (index >= raw.length) return {
				ok: false,
				reason: "an unterminated quote in a redirection target"
			};
			index += 1;
			continue;
		}
		if (character === "\"") {
			started = true;
			quoted = true;
			index += 1;
			while (index < raw.length && raw[index] !== "\"") {
				const inner = raw[index];
				if (inner === "\\") return {
					ok: false,
					reason: "a backslash escape is not supported"
				};
				if (inner === "$") return {
					ok: false,
					reason: "a \"$\" expansion is not supported"
				};
				if (inner === "`") return {
					ok: false,
					reason: "a backtick command substitution is not supported"
				};
				if (inner < " " || inner === "") return {
					ok: false,
					reason: "a control character is not supported"
				};
				token += inner;
				index += 1;
			}
			if (index >= raw.length) return {
				ok: false,
				reason: "an unterminated quote in a redirection target"
			};
			index += 1;
			continue;
		}
		if (character === "$" || character === "`" || character === "\\" || character === "#") return {
			ok: false,
			reason: "a \"$\" expansion, backtick, escape or comment in a redirection target is not supported"
		};
		if (character < " " || character === "") return {
			ok: false,
			reason: "a control character is not supported"
		};
		token += character;
		started = true;
		index += 1;
	}
	if (!started) return {
		ok: false,
		reason: "a redirection without a target is not supported"
	};
	return {
		ok: true,
		token,
		quoted,
		next: index
	};
}
/**
* Classify one parsed redirection. `fd`/`close` are bash fd duplication and
* close; `null` is `/dev/null` (also `>&/dev/null`/`&>/dev/null`, which bash
* treats as "both streams to the file"); everything else touches a real path
* and is validated against the writable roots before the line may stay
* unsandboxed.
* @param operator - the operator as written.
* @param target - the parsed target token.
* @returns the classified redirection.
*/
function classifyRedirect(operator, target) {
	const { token, quoted } = target;
	if (operator === ">&" || operator === "<&") {
		if (/^[0-9]+$/.test(token)) return {
			kind: "fd",
			operator,
			target: token,
			quoted
		};
		if (token === "-") return {
			kind: "close",
			operator,
			target: token,
			quoted
		};
		if (operator === ">&" && token === NULL_DEVICE) return {
			kind: "null",
			operator,
			target: token,
			quoted
		};
		return {
			kind: "file",
			operator,
			target: token,
			quoted
		};
	}
	return token === NULL_DEVICE ? {
		kind: "null",
		operator,
		target: token,
		quoted
	} : {
		kind: "file",
		operator,
		target: token,
		quoted
	};
}
/**
* Whether one redirection has no file effect at all; such redirects never need
* a target check.
* @param redirect - one classified redirection.
* @returns true for a `/dev/null` target, fd duplication or close.
*/
function redirectHasNoFileEffect(redirect) {
	return redirect.kind !== "file";
}
/**
* Validate one operator-typed whitelist entry: exactly one simple command,
* no forwarder/shell as its program, no reserved word, no glob.
* @param raw - the entry text as stored in the plugin configuration.
* @returns the parsed entry, or why it cannot be used.
*/
function parseEntry(raw) {
	const source = raw.trim();
	if (source === "") return rejection("the entry is empty");
	const parsed = parseCommandLine(source, { allowRedirections: false });
	if (!parsed.ok) return rejection(parsed.reason);
	if (parsed.value.segments.length !== 1) return rejection("an entry must be one simple command (no \"&&\", \"|\", \";\" or newline)");
	const tokens = parsed.value.segments[0];
	const program = tokens[0];
	if (program === "") return rejection("the entry has an empty command word");
	if (RESERVED.has(program)) return rejection(`"${program}" is a shell reserved word, not a command`);
	if (FORWARDERS.has(basename(program).toLowerCase())) return rejection(`"${program}" is a shell or command forwarder; whitelisting it would forward arbitrary commands (use the permission mode instead)`);
	if (tokens.some((token) => GLOB_CHARACTER$1.test(token))) return rejection("a glob character (\"*\", \"?\", \"[\", \"]\") in an entry would be expanded by bash before the command runs");
	return {
		ok: true,
		value: {
			source,
			tokens
		}
	};
}
/**
* Whether one simple command's argv starts with an entry's tokens.
* @param argv - the simple command's argv tokens.
* @param entry - the validated entry tokens.
* @returns true when every entry token equals the argv token at its position.
*/
function entryAllows(argv, entry) {
	if (entry.length === 0 || entry.length > argv.length) return false;
	for (let index = 0; index < entry.length; index += 1) if (argv[index] !== entry[index]) return false;
	return true;
}
/**
* Analyze one raw line against the entries: it must decompose, contain at
* least one simple command, and EVERY simple command must be allowed by at
* least one entry. Redirections are returned unjudged so the caller can apply
* its own target policy.
* @param raw - the exact `bash -c` source.
* @param entries - validated entries (empty means nothing is exempt).
* @returns the parsed line when every segment matches, otherwise undefined.
*/
function analyzeWhitelistedLine(raw, entries) {
	if (entries.length === 0) return void 0;
	const parsed = parseCommandLine(raw);
	if (!parsed.ok) return void 0;
	return parsed.value.segments.every((segment) => entries.some((entry) => entryAllows(segment, entry.tokens))) ? parsed.value : void 0;
}
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
function isCommandWhitelisted(raw, entries) {
	const analysis = analyzeWhitelistedLine(raw, entries);
	return analysis !== void 0 && analysis.redirects.every(redirectHasNoFileEffect);
}
/**
* Validate a stored entry list before it persists. Throws on the first unusable
* entry so the settings save is refused with the exact reason and the profile
* document stays clean (`configEditor.edit` runs this through the
* `internal/config` waterfall).
* @param raw - the candidate entry list.
* @returns the parsed entries, deduplicated by their normalized tokens.
* @throws Error naming the offending entry and why it cannot be used.
*/
function validateCommandEntries(raw) {
	const seen = /* @__PURE__ */ new Set();
	const entries = [];
	for (const candidate of raw) {
		const parsed = parseEntry(String(candidate));
		if (!parsed.ok) throw new Error(`unsandboxedCommands entry ${JSON.stringify(candidate)} is not usable: ${parsed.reason}`);
		const key = parsed.value.tokens.join("\0");
		if (seen.has(key)) continue;
		seen.add(key);
		entries.push(parsed.value);
	}
	return entries;
}
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
var CommandWhitelist = class {
	read;
	logger;
	lastRaw;
	value = [];
	constructor(read, logger) {
		this.read = read;
		this.logger = logger;
		this.refresh();
	}
	/** The currently effective entries. */
	get entries() {
		if ((this.read() ?? []) !== this.lastRaw) this.refresh();
		return this.value;
	}
	/**
	* Whole-line check against the live entries.
	* @param command - the exact `bash -c` source.
	* @returns true when the entire line is covered by the whitelist.
	*/
	allows(command) {
		return isCommandWhitelisted(command, this.entries);
	}
	/** Recompute the effective entries from the current volatile value. */
	refresh() {
		const raw = this.read() ?? [];
		this.lastRaw = raw;
		const entries = [];
		const seen = /* @__PURE__ */ new Set();
		for (const candidate of raw) {
			const parsed = parseEntry(String(candidate));
			if (!parsed.ok) {
				this.logger?.error(`dsh-whitelist-sandbox: ignoring unsandboxedCommands entry ${JSON.stringify(candidate)}: ${parsed.reason}`);
				continue;
			}
			const key = parsed.value.tokens.join("\0");
			if (seen.has(key)) continue;
			seen.add(key);
			entries.push(parsed.value);
		}
		this.value = entries;
	}
};
//#endregion
//#region lib/types/redirect-targets.js
/**
* Redirect target validation for the unsandboxed command whitelist.
*
* The shell — not the whitelisted program — performs each redirection, so a
* file target is an unconfined read/write primitive. Before a line with file
* redirects may skip the sandbox, every target must resolve (physically, with
* symlinks followed) into a writable area: the session workspace root, the
* operator's extra writable roots, or the system temp areas the stock
* `workspace-write` policy already grants.
*
* Honest limits: this is a pre-spawn check. A concurrent process could still
* swap a path component for a symlink between the check and the shell's
* `open(2)` (TOCTOU), and the whitelisted program itself is unconfined anyway
* (it can write wherever its own logic allows). The check keeps the *shell's*
* redirect from widening the exemption to arbitrary paths; it is not a
* substitute for the sandbox around non-whitelisted commands.
*/
/** Path comparison follows the host filesystem's case rules. */
const CASE_SENSITIVE = process.platform !== "win32";
/** A glob in a redirect target would be expanded by bash, not by this check. */
const GLOB_CHARACTER = /[*?[\]]/;
function comparable(path) {
	return CASE_SENSITIVE ? path : path.toLowerCase();
}
/** Whether `path` is `root` itself or lives below it (both physical). */
function isUnder(path, root) {
	const target = comparable(path);
	const base = comparable(root);
	if (target === base) return true;
	return target.startsWith(base.endsWith(sep) ? base : base + sep);
}
/** Filesystem failures that mean "the path does not exist" rather than "cannot
* check": only those map to undefined; every other error propagates so the
* caller can fail closed. */
const MISSING_CODES$1 = new Set(["ENOENT", "ENOTDIR"]);
function isMissing$1(error) {
	const code = error?.code;
	return typeof code === "string" && MISSING_CODES$1.has(code);
}
/** `realpath` where a missing path yields undefined, other errors propagate. */
async function physicalPath(path) {
	try {
		return await realpath(path);
	} catch (error) {
		if (isMissing$1(error)) return void 0;
		throw error;
	}
}
/** `lstat` where a missing path yields undefined, other errors propagate. */
async function entryInfo(path) {
	try {
		return await lstat(path);
	} catch (error) {
		if (isMissing$1(error)) return void 0;
		throw error;
	}
}
/**
* Whether every file redirect of one whitelisted line targets a writable area.
*
* Call this only with file redirects taken from a line whose simple commands
* all matched the whitelist, and only when the line is a SINGLE simple command:
* a simple command's redirections are performed before the command runs, so a
* relative target resolves against `workdir`, while an earlier segment of a
* compound line could create a symlink or change the cwd first.
* @param redirects - every redirect the line carries (effect-free ones are ignored).
* @param workdir - the shell's starting directory (the resolved spec workdir).
* @param roots - workspace root, policy extra roots and this plugin's roots.
* @returns true when every file target is physically inside a writable area.
*/
async function redirectsWithinWritableRoots(redirects, workdir, roots) {
	try {
		return await evaluate(redirects, workdir, roots);
	} catch {
		return false;
	}
}
/** The throwing core of {@link redirectsWithinWritableRoots}. */
async function evaluate(redirects, workdir, roots) {
	const fileRedirects = redirects.filter((redirect) => redirect.kind === "file");
	if (fileRedirects.length === 0) return true;
	if (!isAbsolute(workdir)) return false;
	const allowed = [];
	for (const candidate of [
		roots.workspaceRoot,
		...roots.extraWritableRoots,
		...roots.additionalWritableRoots ?? [],
		tmpdir(),
		"/tmp"
	]) {
		const physical = await physicalPath(candidate);
		if (physical !== void 0 && !allowed.includes(physical)) allowed.push(physical);
	}
	if (allowed.length === 0) return false;
	for (const redirect of fileRedirects) if (!await targetAllowed(redirect.target, workdir, allowed)) return false;
	return true;
}
/**
* Validate one redirect target: resolve it against the workdir, follow
* symlinks for the parent directory and for the target itself when it already
* exists, and require the physical result to stay inside a writable root.
* @param target - the parsed, quote-removed target token.
* @param workdir - absolute shell starting directory.
* @param allowed - physical writable roots.
* @returns true when the target cannot escape the writable areas.
*/
async function targetAllowed(target, workdir, allowed) {
	if (target === "" || GLOB_CHARACTER.test(target) || target.includes("~")) return false;
	const absolute = isAbsolute(target) ? target : resolve(workdir, target);
	const parent = dirname(absolute);
	const name = basename(absolute);
	if (name === "" || name === "." || name === "..") return false;
	const physicalParent = await physicalPath(parent);
	if (physicalParent === void 0) return false;
	const candidate = join(physicalParent, name);
	if (!allowed.some((root) => isUnder(candidate, root))) return false;
	if ((await entryInfo(candidate))?.isSymbolicLink() === true) return false;
	return true;
}
//#endregion
//#region lib/types/index.js
/**
* dsh-whitelist-sandbox
*
* Two operator-owned whitelists over the stock sandbox:
*
*  1. Additive writable-path roots for `workspace-write`.
*  2. Command prefixes whose bash invocations run directly on the host, outside
*     the sandbox, under EVERY permission mode except `danger-full-access`
*     (which is already unconfined).
*
* ── 1. Additive writable roots ────────────────────────────────────────────
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
* ── 2. Unsandboxed commands ───────────────────────────────────────────────
* `WhitelistBashExecutor.execute()` decides eligibility BEFORE the stock
* confinement: when the whole `bash -c` source decomposes into simple commands
* that are all covered by the command whitelist (see `command-whitelist.ts`),
* it delegates to the inherited local
* executor — exactly the stock `danger-full-access` path — so the command
* really runs unconfined. The result then carries no `sandbox` facts (the
* truthful "not confined" shape) while `ctx.sandboxPolicy` and the tool layer
* are untouched. Every other case delegates to `SandboxBashExecutor.execute()`
* unchanged, so denial markers, per-call mode stamping, and the
* `sandbox_permissions` escalation channel behave exactly as stock.
*
* The whitelist is deliberately conservative: a compound line must be fully
* covered (both sides of a pipe too), and expansions, comments, background
* jobs, subshells, or escapes disqualify the whole line. Redirections with no
* file effect (`/dev/null`, fd duplication/close) are always accepted; a FILE
* redirect is accepted only on a single simple command whose physical target
* resolves inside the workspace, an extra writable root, or a temp area (see
* `redirect-targets.ts`). The
* stock `sandbox` provider and `sandboxPolicy` service stay mounted; the
* plugin replaces only the two consuming rows (`bash-sandbox`, `fs-sandbox`)
* via the composition patch (disabled rows + a fresh plugin row).
*
* ── Configuration (dsh 0.1.7+) ────────────────────────────────────────────
* One source: this plugin's own profile entry config (`extraWritableRoots` and
* `unsandboxedCommands`), both declared as schemastery `volatile()` fields. The
* settings page edits that entry live through the client `configForms` service;
* the loader swaps the volatile reference in place, so nothing remounts and
* every enforcement side reads the new values on its next call. An unsafe or
* unusable write is refused BEFORE it persists by the `internal/config`
* waterfall registered in `apply`, so the policy document never holds a widened
* root or a forwarder entry.
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
* strip `shell`/`fs` from the whole tree by failing this row. Command entries
* are validated the same way, but per entry: an unusable stored entry is
* dropped with an error log (it grants nothing) while the rest stays effective.
*
* ── Boundaries (honest limits) ────────────────────────────────────────────
*  - The persistent terminal backend (`dsh-terminal-bash`) confines through
*    `ctx.sandbox` directly and is NOT covered; it is not mounted in the web
*    profile.
*  - Windows is unsupported for either whitelist: the ACL restricted-token
*    runner grants per-workspace write SIDs only, and `bash-sandbox` is not
*    the mounted shell there (keep-last-good; never fails load).
*  - A configured root that does not exist grants nothing (the fence's
*    containment is lexical/identity based and the profile grants are
*    no-ops); bwrap mounts are skipped for missing roots because a missing
*    `--bind` source fails the whole command.
*  - Running dsh with a session workspace that itself contains `$DSH_HOME`
*    already exposes settings to the model independent of this plugin; the
*    guard covers the whitelist-induced path, not that pre-existing one.
*  - A whitelisted program can itself execute arbitrary code (build tools,
*    package scripts, git hooks, interpreters). The whitelist only guarantees
*    that its authorization decision is scoped to the named command, not that
*    the named program is harmless.
*/
/** Path-containment mechanics mirrored from `dsh-fs-sandbox` so the whitelist
* fallback and the security guard use the exact same lexical/identity
* semantics as the stock fence. */
const MISSING_CODES = new Set(["ENOENT", "ENOTDIR"]);
function isMissing(error) {
	const code = error.code;
	return typeof code === "string" && MISSING_CODES.has(code);
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
function injectExtraRootGrants(argv, extraRoots) {
	if (extraRoots.length === 0) return argv;
	const existing = extraRoots.filter((root) => existsSync(root));
	if (existing.length === 0) return argv;
	const sepIndex = argv.indexOf("--");
	if (argv[1] === "-p" && typeof argv[2] === "string") {
		const extra = existing.map((root) => `(allow file-write* (subpath ${sbplString(root)}))`).join(" ");
		const copy = argv.slice();
		copy[2] = `${argv[2]} ${extra}`;
		return copy;
	}
	if (argv[0] === "bwrap") {
		const grants = existing.flatMap((root) => [
			"--bind",
			root,
			root
		]);
		const copy = argv.slice();
		copy.splice(sepIndex === -1 ? copy.length : sepIndex, 0, ...grants);
		return copy;
	}
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
function canonicalizeExtraRoots(roots, logger) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const raw of roots ?? []) {
		const canonical = canonicalPath(raw);
		if (seen.has(canonical)) continue;
		seen.add(canonical);
		if (!existsSync(canonical)) logger?.warn(`dsh-whitelist-sandbox: whitelist root ${JSON.stringify(raw)} (canonical ${JSON.stringify(canonical)}) does not exist; it grants nothing until it exists`);
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
function assertSafeWhitelistRoots(roots, store) {
	for (const root of roots) {
		if (isLexicallyUnder(store.dshHome, root, process.platform !== "win32")) throw new Error(`whitelist root ${JSON.stringify(root)} would make the DSH home writable (${store.dshHome}); a jailbroken model could rewrite settings/credentials/session state to widen its own sandbox — refusing`);
		if (isLexicallyUnder(store.settingsPath, root, process.platform !== "win32")) throw new Error(`whitelist root ${JSON.stringify(root)} would make the DSH settings/policy document writable (${store.settingsPath}); a jailbroken model could rewrite it to widen its own sandbox — refusing`);
	}
}
/** Reject a non-empty whitelist on Windows: the ACL restricted-token runner
* grants per-workspace write SIDs only, so extra roots cannot be enforced, and
* the mounted shell there is `pwsh-sandbox`, not the bash executor this plugin
* replaces. */
function assertSupportedWhitelistPlatform(roots, commands = []) {
	if ((roots.length > 0 || commands.length > 0) && process.platform === "win32") throw new Error("the sandbox whitelist is not supported on Windows yet (the ACL restricted-token runner grants per-workspace write SIDs only and the mounted shell is pwsh-sandbox); remove the whitelist entries or run on macOS/Linux");
}
/**
* Live whitelist source over a schemastery `volatile()` reference: both
* enforcement sides read `roots` per call, so a settings hot-reload applies
* immediately without restarting anything. Every read re-runs canonicalization
* and the security guard; a rejected value is logged loudly and the previous
* good whitelist is kept, so a bad stored value can neither widen the sandbox
* nor fail the plugin load.
*/
var WhitelistRoots = class {
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
		if (this.read() !== this.lastRaw) this.refresh();
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
		} catch (error) {
			this.logger?.error(`dsh-whitelist-sandbox: refusing ${JSON.stringify(raw)} (${error.message}); keeping the previous whitelist`);
		}
	}
};
/**
* bash side: keeps the stock wrap, injects the extra grants into the selected
* runner's argv, and routes wholly-whitelisted command lines through the
* inherited local executor (the stock `danger-full-access` path) instead of the
* sandbox. Constructing it registers `ctx.shell` (Service name chain).
*/
var WhitelistBashExecutor = class extends SandboxBashExecutor {
	rootsSource;
	commands;
	logger;
	constructor(ctx, config, rootsSource, commands, logger) {
		super(ctx, config);
		this.rootsSource = rootsSource;
		this.commands = commands;
		this.logger = logger;
	}
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
	async execute(spec) {
		const policy = spec.sandboxPolicy;
		if (policy !== void 0 && policy.mode !== "danger-full-access" && await this.exemptFromSandbox(spec, policy)) {
			this.logger?.debug?.(`dsh-whitelist-sandbox: running ${JSON.stringify(spec.command)} outside the sandbox (whitelisted command)`);
			return LocalBashExecutor.prototype.execute.call(this, spec);
		}
		return super.execute(spec);
	}
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
	async exemptFromSandbox(spec, policy) {
		const analysis = analyzeWhitelistedLine(spec.command, this.commands.entries);
		if (analysis === void 0) return false;
		if (analysis.redirects.every(redirectHasNoFileEffect)) return true;
		if (analysis.segments.length !== 1) return false;
		return redirectsWithinWritableRoots(analysis.redirects, spec.workdir, {
			workspaceRoot: policy.workspaceRoot,
			additionalWritableRoots: policy.additionalWritableRoots,
			extraWritableRoots: this.rootsSource.roots
		});
	}
	async confine(command, policy, signal) {
		const confined = await SandboxBashExecutor.prototype.confine.call(this, command, policy, signal);
		const extraRoots = this.rootsSource.roots;
		if (extraRoots.length === 0) return confined;
		const argv = injectExtraRootGrants(confined.argv, extraRoots);
		if (argv === confined.argv) return confined;
		return {
			...confined,
			argv
		};
	}
};
/**
* fs side: when the stock fence denies under workspace-write, fall back to the
* whitelist containment. Constructing it registers `ctx.fs` (Service name
* chain). Denials for non-whitelisted targets keep the structured
* `FS_SANDBOX_DENIED` the tool layer maps to the model-facing marker.
*/
var WhitelistFileSystem = class extends SandboxedFileSystem {
	rootsSource;
	constructor(ctx, config, rootsSource) {
		super(ctx, config);
		this.rootsSource = rootsSource;
	}
	async checkedTarget(target, sandboxPolicy) {
		const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
		const extraRoots = this.rootsSource.roots;
		if (policy.mode !== "workspace-write" || extraRoots.length === 0) return SandboxedFileSystem.prototype.checkedTarget.call(this, target, sandboxPolicy);
		const base = SandboxedFileSystem.prototype;
		try {
			return await base.checkedTarget.call(this, target, sandboxPolicy);
		} catch (error) {
			if (!(error instanceof FsError) || error.code !== "FS_SANDBOX_DENIED") throw error;
			const fresh = await this.resolve(target.displayPath);
			for (const root of extraRoots) if (await isPathUnder(fresh.targetKey, root)) return fresh;
			throw error;
		}
	}
};
const name = "dsh-whitelist-sandbox";
/** Runs after the sandbox stack this plugin builds on is mounted. */
const inject = [
	"subprocess",
	"sandbox",
	"sandboxPolicy"
];
/** This plugin's profile entry id — also the settings namespace the client
* `configForms.get(...)` reads. It must match the row id of whatever patch
* layer mounts this plugin (the extension registers the package as a profile
* bundle, whose `cordis.patch.yml` inserts exactly this id). */
const SETTINGS_ENTRY = "dsh-whitelist-sandbox";
/** Runtime schema for {@link WhitelistConfig}. */
const Config = z.object({
	extraWritableRoots: z.array(z.string()).default([]).volatile(),
	unsandboxedCommands: z.array(z.string()).default([]).volatile()
});
/**
* Validate a candidate config BEFORE it persists. Registered on the loader's
* `internal/config` waterfall, which `configEditor.edit` runs before writing
* the profile patch, so an unsafe root or an unusable command entry refuses
* the save and leaves the document untouched. Boot-time composition bypasses
* this hook (it is registered by `apply`, after the row's own config
* resolved); the read-time guards in {@link WhitelistRoots} and
* {@link CommandWhitelist} cover that path instead.
*/
function installWhitelistWriteGuard(ctx, store) {
	ctx.on("internal/config", function(_config, next) {
		const raw = next();
		if (this !== ctx.fiber) return raw;
		const candidate = Config(raw);
		const canonical = canonicalizeExtraRoots(candidate.extraWritableRoots.get(), ctx.logger);
		assertSafeWhitelistRoots(canonical, store);
		assertSupportedWhitelistPlatform(canonical, candidate.unsandboxedCommands.get());
		validateCommandEntries(candidate.unsandboxedCommands.get());
		return raw;
	});
}
function apply(ctx, config) {
	const dshHome = canonicalPath(resolveDshHome());
	const store = {
		settingsPath: canonicalPath(join(dshHome, "settings.yaml")),
		dshHome
	};
	const logger = ctx.logger;
	const rootsSource = new WhitelistRoots(() => config.extraWritableRoots.get(), store, logger);
	const commandSource = new CommandWhitelist(() => config.unsandboxedCommands.get(), logger);
	new WhitelistBashExecutor(ctx, LocalBashExecutor.Config({ timeoutMs: 6e4 }), rootsSource, commandSource, logger);
	new WhitelistFileSystem(ctx, LocalFileSystem.Config({}), rootsSource);
	installWhitelistWriteGuard(ctx, store);
	ctx.inject(["settings"], (scope) => {
		scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber));
		store.settingsPath = canonicalPath(scope.settings.documentPath);
	});
	ctx.inject(["systemPrompt"], (scope) => {
		scope.systemPrompt.context({
			name: "whitelist:extra-roots",
			order: 115,
			text: () => {
				const roots = rootsSource.roots;
				const commands = commandSource.entries;
				const lines = [];
				if (roots.length > 0) lines.push(`Additional writable paths (whitelist): ${roots.join(", ")}`);
				if (commands.length > 0) lines.push(`Commands matching these prefixes run directly on the host, outside the file sandbox (a compound line must be fully covered; redirections, expansions, comments, background jobs and subshells are never exempt): ${commands.map((entry) => entry.source).join(", ")}`);
				return lines.join("\n");
			}
		});
	});
	const applied = rootsSource.roots;
	const commands = commandSource.entries;
	ctx.logger.info(`dsh-whitelist-sandbox: ${applied.length} extra writable root(s)${applied.length > 0 ? ` (${applied.join(", ")})` : ""}`);
	ctx.logger.info(`dsh-whitelist-sandbox: ${commands.length} unsandboxed command prefix(es)${commands.length > 0 ? ` (${commands.map((entry) => entry.source).join(", ")})` : ""}`);
}
//#endregion
export { Config, SETTINGS_ENTRY, WhitelistBashExecutor, WhitelistFileSystem, WhitelistRoots, apply, assertSafeWhitelistRoots, assertSupportedWhitelistPlatform, canonicalizeExtraRoots, inject, injectExtraRootGrants, name };

//# sourceMappingURL=index.js.map