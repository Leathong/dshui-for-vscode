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
//#region lib/types/audit/errors.js
/** A static-audit refusal: never exempt, with a frozen reason code. */
var AuditError = class extends Error {
	/** The frozen reason code (see `docs/script-audit-spec.md` §6). */
	code;
	/** Optional detail: command word, target, variable name, … */
	detail;
	constructor(code, detail) {
		super(detail === void 0 ? code : `${code}: ${detail}`);
		this.name = "AuditError";
		this.code = code;
		this.detail = detail;
	}
};
/**
* Throw one static-audit refusal.
* @param code - frozen reason code.
* @param detail - optional token/name the hint renderer can quote.
*/
function fail(code, detail) {
	throw new AuditError(code, detail);
}
//#endregion
//#region lib/types/audit/lexer.js
/**
* Hand-written lexer for the P1 exempt-shell subset (`docs/script-audit-spec.md`).
*
* It never evaluates anything: it only splits the source into words, operators
* and newlines, flagging each word with the facts the analyzer needs
* (quoted / expanded / glob / tilde / assignment-prefix). Every construct that
* is outside the frozen subset — command substitution, backticks, arithmetic,
* process substitution, `$'…'`, `${…}` operators, heredoc bodies with dynamic
* execution — is refused here with its reason code, so the parser only sees a
* language it understands.
*
* Heredoc bodies are collected by the lexer because bash reads them line by
* line, not as ordinary words. A quoted delimiter makes the body inert data; an
* unquoted one may only perform plain `$NAME`/`${NAME}` expansion.
*/
const GLOB_CHARACTERS = new Set([
	"*",
	"?",
	"[",
	"]"
]);
const IO_NUMBER = /^[0-9]+$/;
const ASSIGNMENT_PREFIX = /^([A-Za-z_][A-Za-z0-9_]*)=/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAME_START = /[A-Za-z_]/;
const NAME_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;
const SPECIAL_PARAMETERS = "?!$#@*-";
function isControlCharacter(character) {
	const code = character.codePointAt(0) ?? 0;
	return code < 32 && character !== "	" && character !== "\n" || code === 127;
}
function describeControl(character) {
	return `control character U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}
function isDelimiter(character) {
	if (character === void 0) return true;
	if (character === " " || character === "	" || character === "\n") return true;
	return ";&|()<>{}".includes(character);
}
/**
* Validate one unquoted heredoc body: it is expanded by bash before it becomes
* the command's stdin, so it may only contain literal `$`/`$NAME`/`${NAME}`
* forms — no command substitution, no backticks, no arithmetic, no `${…}`
* operators and no process substitution.
* @param body - the raw body text (without the delimiter line).
*/
function validateHeredocBody(body) {
	let cursor = 0;
	while (cursor < body.length) {
		const character = body[cursor];
		if (character === "\\") {
			cursor += 2;
			continue;
		}
		if (character === "`") fail("syntax:backtick", "a backtick in a heredoc body");
		if (character === "$") {
			const next = body[cursor + 1];
			if (next === "(") {
				if (body[cursor + 2] === "(") fail("syntax:arithmetic", "$((...)) in a heredoc body");
				fail("syntax:command-substitution", "$(...) in a heredoc body");
			}
			if (next === "{") {
				const close = body.indexOf("}", cursor + 2);
				if (close === -1) fail("syntax:param-operator", "an unterminated ${...} in a heredoc body");
				const inner = body.slice(cursor + 2, close);
				if (!NAME.test(inner)) fail("syntax:param-operator", `\${${inner}} in a heredoc body`);
				cursor = close + 1;
				continue;
			}
			cursor += 1;
			continue;
		}
		if ((character === "<" || character === ">") && body[cursor + 1] === "(") fail("syntax:process-substitution", `${character}(...) in a heredoc body`);
		cursor += 1;
	}
}
/**
* Lex one `bash -c` source into the P1 subset.
* @param source - the exact command source.
* @returns the token stream and every heredoc body.
* @throws AuditError on any construct outside the frozen subset.
*/
function tokenize(source) {
	const tokens = [];
	const heredocs = /* @__PURE__ */ new Map();
	const pending = [];
	let expectDelimiterFor;
	let index = 0;
	let builder;
	const ensure = () => {
		if (builder === void 0) builder = {
			value: "",
			quoted: false,
			expanded: false,
			glob: false,
			tilde: false,
			plainUntil: 0
		};
		return builder;
	};
	const appendPlain = (text) => {
		const word = ensure();
		word.value += text;
		word.plainUntil = word.value.length;
		for (const character of text) {
			if (GLOB_CHARACTERS.has(character)) word.glob = true;
			if (character === "~") word.tilde = true;
		}
	};
	const appendQuoted = (text) => {
		const word = ensure();
		word.quoted = true;
		word.value += text;
	};
	const appendEscaped = (text) => {
		const word = ensure();
		word.quoted = true;
		word.value += text;
	};
	const appendExpanded = (text) => {
		const word = ensure();
		word.expanded = true;
		word.value += text;
	};
	const finishWord = () => {
		if (builder === void 0) return;
		const current = builder;
		builder = void 0;
		let assignmentName;
		const plain = current.value.slice(0, current.plainUntil);
		const match = ASSIGNMENT_PREFIX.exec(plain);
		if (match !== null) assignmentName = match[1];
		const word = {
			value: current.value,
			quoted: current.quoted,
			expanded: current.expanded,
			glob: current.glob,
			tilde: current.tilde,
			...assignmentName === void 0 ? {} : { assignmentName }
		};
		tokens.push({
			type: "word",
			word
		});
		if (expectDelimiterFor !== void 0) {
			if (word.expanded) fail("syntax:unsupported", "a heredoc delimiter cannot contain an expansion");
			pending.push({
				opIndex: expectDelimiterFor,
				delimiter: word.value,
				quoted: word.quoted
			});
			expectDelimiterFor = void 0;
		}
	};
	/** A word immediately before a redirect operator is bash's IO number when it
	* is unquoted all digits; otherwise it is an ordinary argument. */
	const flushBeforeRedirect = () => {
		if (builder === void 0) return;
		const current = builder;
		if (!current.quoted && !current.expanded && !current.glob && !current.tilde && IO_NUMBER.test(current.value)) {
			builder = void 0;
			return;
		}
		finishWord();
	};
	const readDollar = () => {
		index += 1;
		const next = source[index];
		if (next === void 0) fail("syntax:unsupported", "a trailing \"$\" is not an expansion");
		if (next === "(") {
			if (source[index + 1] === "(") fail("syntax:arithmetic", "$((...))");
			fail("syntax:command-substitution", "$(...)");
		}
		if (next === "`") fail("syntax:backtick", "`...`");
		if (next === "'" || next === "\"") fail("syntax:unsupported", "$ quoting ($'...' or $\"...\")");
		if (next === "{") {
			const close = source.indexOf("}", index + 1);
			if (close === -1) fail("syntax:param-operator", "an unterminated ${...}");
			const inner = source.slice(index + 1, close);
			if (!NAME.test(inner)) fail("syntax:param-operator", "${" + inner + "}");
			appendExpanded("${" + inner + "}");
			index = close + 1;
			return;
		}
		if (NAME_START.test(next)) {
			let end = index + 1;
			while (end < source.length && NAME_PART.test(source[end])) end += 1;
			appendExpanded(source.slice(index, end));
			index = end;
			return;
		}
		if (SPECIAL_PARAMETERS.includes(next) || DIGIT.test(next)) {
			appendExpanded("$" + next);
			index += 1;
			return;
		}
		fail("syntax:unsupported", "a \"$\" that starts no allowed expansion (quote or escape a literal \"$\")");
	};
	const readSingleQuote = () => {
		ensure().quoted = true;
		index += 1;
		while (true) {
			if (index >= source.length) fail("syntax:unterminated-quote", "an unterminated single quote");
			const character = source[index];
			if (character === "'") {
				index += 1;
				return;
			}
			if (isControlCharacter(character)) fail("syntax:control-char", describeControl(character));
			appendQuoted(character);
			index += 1;
		}
	};
	const readDoubleQuote = () => {
		ensure().quoted = true;
		index += 1;
		while (true) {
			if (index >= source.length) fail("syntax:unterminated-quote", "an unterminated double quote");
			const character = source[index];
			if (character === "\"") {
				index += 1;
				return;
			}
			if (character === "\\") {
				const next = source[index + 1];
				if (next === void 0) fail("syntax:unterminated-quote", "an unterminated double quote");
				if (next === "\n") {
					index += 2;
					continue;
				}
				if (next === "$" || next === "`" || next === "\"" || next === "\\") {
					appendQuoted(next);
					index += 2;
					continue;
				}
				appendQuoted("\\");
				appendQuoted(next);
				index += 2;
				continue;
			}
			if (character === "$") {
				readDollar();
				continue;
			}
			if (character === "`") fail("syntax:backtick", "`...`");
			if (isControlCharacter(character)) fail("syntax:control-char", describeControl(character));
			appendQuoted(character);
			index += 1;
		}
	};
	const readHeredocBody = (delimiter, quoted) => {
		let body = "";
		let cursor = index;
		while (true) {
			if (cursor >= source.length) fail("syntax:unterminated-quote", `a heredoc "${delimiter}" is never closed`);
			const newline = source.indexOf("\n", cursor);
			const lineEnd = newline === -1 ? source.length : newline;
			const line = source.slice(cursor, lineEnd);
			for (const character of line) if (isControlCharacter(character)) fail("syntax:control-char", describeControl(character));
			if (line === delimiter) {
				if (!quoted) validateHeredocBody(body);
				return {
					body,
					next: newline === -1 ? source.length : newline + 1
				};
			}
			body += line;
			if (newline !== -1) body += "\n";
			cursor = newline === -1 ? source.length : newline + 1;
		}
	};
	const emitNewline = () => {
		tokens.push({ type: "newline" });
		for (const heredoc of pending) {
			const read = readHeredocBody(heredoc.delimiter, heredoc.quoted);
			heredocs.set(heredoc.opIndex, {
				delimiter: heredoc.delimiter,
				quoted: heredoc.quoted,
				body: read.body
			});
			index = read.next;
		}
		pending.length = 0;
	};
	while (index < source.length) {
		const character = source[index];
		if (character === "\\") {
			const next = source[index + 1];
			if (next === "\n") {
				index += 2;
				continue;
			}
			if (next === void 0) fail("syntax:unsupported", "a trailing backslash is not supported");
			appendEscaped(next);
			index += 2;
			continue;
		}
		if (character === " " || character === "	") {
			finishWord();
			index += 1;
			continue;
		}
		if (character === "\n") {
			finishWord();
			if (expectDelimiterFor !== void 0) fail("syntax:redirect-form", "a heredoc without a delimiter");
			index += 1;
			emitNewline();
			continue;
		}
		if (character === "#") {
			if (builder === void 0) {
				if (expectDelimiterFor !== void 0) fail("syntax:redirect-form", "a heredoc without a delimiter");
				const newline = source.indexOf("\n", index);
				index = newline === -1 ? source.length : newline;
				continue;
			}
			appendPlain("#");
			index += 1;
			continue;
		}
		if (character === "'") {
			readSingleQuote();
			continue;
		}
		if (character === "\"") {
			readDoubleQuote();
			continue;
		}
		if (character === "$") {
			readDollar();
			continue;
		}
		if (character === "`") fail("syntax:backtick", "`...`");
		if (character === ";") {
			finishWord();
			if (source[index + 1] === ";") if (source[index + 2] === "&") {
				tokens.push({
					type: "op",
					value: ";;&"
				});
				index += 3;
			} else {
				tokens.push({
					type: "op",
					value: ";;"
				});
				index += 2;
			}
			else if (source[index + 1] === "&") {
				tokens.push({
					type: "op",
					value: ";&"
				});
				index += 2;
			} else {
				tokens.push({
					type: "op",
					value: ";"
				});
				index += 1;
			}
			continue;
		}
		if (character === "|") {
			finishWord();
			if (source[index + 1] === "|") {
				tokens.push({
					type: "op",
					value: "||"
				});
				index += 2;
			} else if (source[index + 1] === "&") fail("syntax:unsupported", "the \"|&\" pipe is not in the exempt subset");
			else {
				tokens.push({
					type: "op",
					value: "|"
				});
				index += 1;
			}
			continue;
		}
		if (character === "&") {
			const next = source[index + 1];
			if (next === "&") {
				finishWord();
				tokens.push({
					type: "op",
					value: "&&"
				});
				index += 2;
				continue;
			}
			if (next === ">") {
				finishWord();
				if (source[index + 2] === ">") {
					tokens.push({
						type: "op",
						value: "&>>"
					});
					index += 3;
				} else {
					tokens.push({
						type: "op",
						value: "&>"
					});
					index += 2;
				}
				continue;
			}
			fail("syntax:background", "background \"&\" (use run_in_background instead)");
		}
		if (character === ">" || character === "<") {
			if (source[index + 1] === "(") fail("syntax:process-substitution", `${character}(...)`);
			if (expectDelimiterFor !== void 0) fail("syntax:redirect-form", "a heredoc without a delimiter");
			flushBeforeRedirect();
			if (character === ">") {
				if (source[index + 1] === ">") {
					tokens.push({
						type: "op",
						value: ">>"
					});
					index += 2;
				} else if (source[index + 1] === "&") {
					tokens.push({
						type: "op",
						value: ">&"
					});
					index += 2;
				} else if (source[index + 1] === "|") {
					tokens.push({
						type: "op",
						value: ">|"
					});
					index += 2;
				} else {
					tokens.push({
						type: "op",
						value: ">"
					});
					index += 1;
				}
				continue;
			}
			if (source[index + 1] === "<") {
				if (source[index + 2] === "<") {
					tokens.push({
						type: "op",
						value: "<<<"
					});
					index += 3;
				} else if (source[index + 2] === "-") fail("syntax:unsupported", "the \"<<-\" heredoc form is not in the exempt subset");
				else {
					tokens.push({
						type: "op",
						value: "<<"
					});
					index += 2;
					expectDelimiterFor = tokens.length - 1;
				}
				continue;
			}
			if (source[index + 1] === ">") {
				tokens.push({
					type: "op",
					value: "<>"
				});
				index += 2;
				continue;
			}
			if (source[index + 1] === "&") {
				tokens.push({
					type: "op",
					value: "<&"
				});
				index += 2;
				continue;
			}
			tokens.push({
				type: "op",
				value: "<"
			});
			index += 1;
			continue;
		}
		if (character === "(") {
			if (source[index + 1] === "(") fail("syntax:arithmetic", "((...))");
			finishWord();
			tokens.push({
				type: "op",
				value: "("
			});
			index += 1;
			continue;
		}
		if (character === ")") {
			finishWord();
			tokens.push({
				type: "op",
				value: ")"
			});
			index += 1;
			continue;
		}
		if (character === "{" || character === "}") {
			if (builder !== void 0) fail("syntax:unsupported", "brace expansion is not in the exempt subset");
			if (!isDelimiter(source[index + 1])) fail("syntax:unsupported", "brace expansion is not in the exempt subset");
			tokens.push({
				type: "op",
				value: character
			});
			index += 1;
			continue;
		}
		if (isControlCharacter(character)) fail("syntax:control-char", describeControl(character));
		appendPlain(character);
		index += 1;
	}
	finishWord();
	if (expectDelimiterFor !== void 0) fail("syntax:redirect-form", "a heredoc without a delimiter");
	if (pending.length > 0) fail("syntax:unterminated-quote", "a heredoc body is missing its delimiter line");
	return {
		tokens,
		heredocs
	};
}
//#endregion
//#region lib/types/audit/rules.js
/**
* Shared P1 rule tables: the frozen "denied program" sets, the sensitive
* assignment names, and the small predicates both the command-entry validator
* (`src/command-whitelist.ts`) and the static analyzer consume.
*
* Keeping them in one place matters: an entry must be rejected for exactly the
* programs the analyzer refuses at command position, otherwise the two sides
* could drift apart.
*/
/** Programs that execute arbitrary code from their arguments. */
const DYNAMIC_EXEC = new Set([
	"eval",
	"source",
	".",
	"exec",
	"command",
	"builtin",
	"fc",
	"trap"
]);
/** Programs that rewrite shell or loader resolution (they grant nothing by
* themselves but disable every invariant the whitelist relies on). */
const ENVIRONMENT = new Set([
	"export",
	"declare",
	"typeset",
	"readonly",
	"local",
	"set",
	"shopt",
	"hash",
	"enable",
	"read",
	"mapfile",
	"readarray",
	"getopts",
	"let",
	"bind"
]);
/** Alias builtins: rejected before an alias can rewrite the command word. */
const ALIAS = new Set(["alias", "unalias"]);
/** Shells and programs whose purpose is forwarding another command. */
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
/**
* Classify a command word as a denied program. The comparison uses the
* lowercased basename of the word, so `/bin/Bash` and `BASH` are caught on
* case-insensitive filesystems too and an absolute path never bypasses the
* check.
* @param name - the command word as written.
* @returns the refusal category, or undefined when the word is not denied.
*/
function classifyDeniedProgram(name) {
	const program = basename(name).toLowerCase();
	if (DYNAMIC_EXEC.has(program)) return {
		code: "program:dynamic-exec",
		kind: "dynamic-exec"
	};
	if (ENVIRONMENT.has(program)) return {
		code: "program:environment",
		kind: "environment"
	};
	if (ALIAS.has(program)) return {
		code: "syntax:alias",
		kind: "alias"
	};
	if (FORWARDERS.has(program)) return {
		code: "program:forwarder",
		kind: "forwarder"
	};
}
/**
* Whether a command word names a program that can never be exempt, including
* `printf` only when invoked with a `-v` variable-assignment option.
* @param name - the command word as written.
* @param args - the command's arguments (checked only for `printf`).
* @returns true when the program is denied outright.
*/
function isDeniedProgram(name, args = []) {
	if (classifyDeniedProgram(name) !== void 0) return true;
	if (basename(name).toLowerCase() !== "printf") return false;
	for (const arg of args) {
		if (arg === "--") return false;
		if (arg.startsWith("-v")) return true;
	}
	return false;
}
/**
* Why one denied program cannot be whitelisted (used by entry validation).
* @param name - the command word as written.
* @param denied - its classification.
* @returns the operator-facing reason sentence.
*/
function deniedProgramReason(name, denied) {
	const quoted = JSON.stringify(name);
	switch (denied.kind) {
		case "dynamic-exec": return `${quoted} can execute arbitrary commands, so it can never be whitelisted`;
		case "environment": return `${quoted} can change shell or loader resolution, so it can never be whitelisted`;
		case "alias": return `${quoted} is an alias builtin, so it can never be whitelisted`;
		case "forwarder": return `${quoted} is a shell or command forwarder; whitelisting it would forward arbitrary commands (use the permission mode instead)`;
	}
}
/** Variables that decide shell/loader resolution; assigning them (even alone)
* can change what a later bare command word resolves to (`PATH`, `IFS`, …). */
const SENSITIVE_ASSIGNMENTS = new Set([
	"PATH",
	"IFS",
	"CDPATH",
	"GLOBIGNORE",
	"BASH_ENV",
	"ENV",
	"SHELLOPTS",
	"BASHOPTS",
	"PS4",
	"BASH_XTRACEFD"
]);
/**
* Whether one standalone assignment (or prefix assignment) targets a sensitive
* variable. Names are case-sensitive, matching bash; `LD_*`/`DYLD_*` cover the
* dynamic loader's whole namespace.
* @param name - the variable name as written.
* @returns true when assigning it must be refused.
*/
function isSensitiveAssignmentName(name) {
	return SENSITIVE_ASSIGNMENTS.has(name) || name.startsWith("LD_") || name.startsWith("DYLD_");
}
/** Bare command names that mutate the shell's working directory. */
const CWD_MUTATORS = new Set([
	"cd",
	"pushd",
	"popd"
]);
/**
* Whether a bare, literal command word changes the shell's cwd (which makes a
* relative redirect target unsafe later in the same call).
* @param name - the command word (quotes already removed).
* @returns true for `cd`, `pushd` and `popd`.
*/
function isCwdMutator(name) {
	return CWD_MUTATORS.has(name);
}
/** Shell reserved words: they are handled by the shell, never by a program,
* so they can never be a whitelist entry. */
const RESERVED_WORDS = new Set([
	"!",
	"{",
	"}",
	"[[",
	"]]",
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
//#endregion
//#region lib/types/command-whitelist.js
/**
* Operator command whitelist: entry validation and the live volatile source.
*
* The P1 security model is implemented by the static analyzer in
* `src/audit/`; this module only owns (1) refusing unusable operator entries
* before they persist or take effect and (2) exposing the live entry list.
*
* An entry is a literal argv prefix of **1..N words** (`git`, `git status`,
* `/usr/local/bin/tool`): the first word is a bare command name or an absolute
* path, the remaining words are literal argument words. Quotes are removed and
* tokens are compared word by word. Relative paths, `~`, globs, expansions,
* redirections/separators, empty entries, assignments and the denied programs
* (shells/forwarders, `eval`/`source`/…, environment builtins, aliases, and
* `printf -v`) can never be part of an entry — see `src/audit/rules.ts`.
*
* Requirements are deliberately validated here as well as at audit time: the
* settings write path runs {@link validateCommandEntries} before persisting, so
* a bad save is refused with the exact offending entry and reason, and the
* live source drops individually unusable stored entries (they grant nothing)
* without failing the plugin row.
*/
function rejection(reason) {
	return {
		ok: false,
		reason
	};
}
function describeError(error) {
	return error instanceof Error ? error.message : String(error);
}
/** Refusal sentence for one literal token that is not allowed in a prefix. */
function literalTokenReason(word, position) {
	if (word.expanded) return `${position} contains a "$" expansion; an entry prefix must be literal`;
	if (word.glob) return `${position} contains a glob character ("*", "?", "[", "]") that bash would expand`;
	if (word.tilde) return `${position} contains "~", which bash would expand`;
}
/**
* Validate one operator-typed whitelist entry.
* @param raw - the entry text as stored in the plugin configuration.
* @returns the parsed entry (literal argv prefix), or why it cannot be used.
*/
function parseEntry(raw) {
	const source = raw.trim();
	if (source === "") return rejection("the entry is empty");
	let tokens;
	try {
		tokens = tokenize(source).tokens;
	} catch (error) {
		return rejection(describeError(error));
	}
	const words = [];
	for (const token of tokens) {
		if (token.type === "word") {
			words.push(token.word);
			continue;
		}
		return rejection("an entry must be literal command words only (no operators, redirections, separators or newlines)");
	}
	if (words.length === 0) return rejection("the entry is empty");
	const first = words[0];
	if (first.value === "") return rejection("the entry has an empty command word");
	if (first.assignmentName !== void 0) return rejection("an entry must be a command word, not an assignment");
	const firstLiteral = literalTokenReason(first, "the command word");
	if (firstLiteral !== void 0) return rejection(firstLiteral);
	const denied = classifyDeniedProgram(first.value);
	if (denied !== void 0) return rejection(deniedProgramReason(first.value, denied));
	if (RESERVED_WORDS.has(first.value)) return rejection(`"${first.value}" is a shell reserved word, not a command`);
	if (!isAbsolute(first.value) && (first.value.includes("/") || first.value === "..")) return rejection(`"${first.value}" is a relative path; an entry must be a bare command name or an absolute path`);
	for (const word of words.slice(1)) {
		const reason = literalTokenReason(word, `the entry argument ${JSON.stringify(word.value)}`);
		if (reason !== void 0) return rejection(reason);
	}
	return {
		ok: true,
		value: {
			source,
			tokens: words.map((word) => word.value)
		}
	};
}
/**
* Validate a stored entry list before it persists. Throws on the first unusable
* entry so the settings save is refused with the exact reason, and the profile
* document stays clean.
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
* executor and the analyzer read `entries` per call, so a settings hot-reload
* applies immediately without remounting.
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
* Physical redirect-target validation for the P1 static audit.
*
* The shell — not a whitelisted program — performs every redirection, so a
* file target is an unconfined read/write primitive. Before one call may skip
* the sandbox, each file target must be a literal path whose physical location
* (symlinks followed for the parent directory, final component checked with
* `lstat`) lies inside a writable area: the session workspace root, the
* operator's extra writable roots, the policy's additional roots, or the system
* temp areas the stock `workspace-write` policy already grants.
*
* The same physical-root collection and containment predicate are reused by
* the analyzer's absolute-command check (`match:absolute-model-writable`), so
* "model-writable" means exactly one thing on both sides.
*
* Honest limits: this is a pre-spawn check. A concurrent process could still
* swap a path component between the check and the shell's `open(2)` (TOCTOU);
* the threat model (`docs/script-audit-spec.md` §7) accepts that.
*/
/** Path comparison follows the host filesystem's case rules. */
const CASE_SENSITIVE = process.platform !== "win32";
/** A glob in a redirect target would be expanded by bash, not by this check. */
const GLOB_CHARACTER = /[*?[\]]/;
function comparable(path) {
	return CASE_SENSITIVE ? path : path.toLowerCase();
}
/**
* Whether a physical path is `root` itself or lives below it (both physical).
* @param path - the physical candidate.
* @param root - the physical root.
* @returns true when `path` is contained in `root`.
*/
function isUnderReal(path, root) {
	const target = comparable(path);
	const base = comparable(root);
	if (target === base) return true;
	return target.startsWith(base.endsWith(sep) ? base : base + sep);
}
/**
* Whether a physical path lies inside any of the physical model-writable roots.
* @param path - the physical path.
* @param roots - physical roots from {@link collectWritableRoots}.
* @returns true when the path is model-writable and must be refused.
*/
function isInsideWritableRoots(path, roots) {
	return roots.some((root) => isUnderReal(path, root));
}
/** Filesystem failures that mean "the path does not exist" rather than "cannot
* check": only those are swallowed; every other error fails closed. */
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
* Resolve the model-writable roots physically, skipping ones that do not
* exist (a missing root grants nothing) and failing closed on any other
* filesystem error.
* @param roots - workspace root, policy additional roots and plugin roots.
* @returns deduplicated physical roots, including the temp areas.
*/
async function collectWritableRoots(roots) {
	const candidates = [
		roots.workspaceRoot,
		...roots.extraWritableRoots,
		...roots.additionalWritableRoots ?? [],
		tmpdir(),
		"/tmp"
	];
	const allowed = [];
	for (const candidate of candidates) {
		const physical = await physicalPath(candidate);
		if (physical !== void 0 && !allowed.includes(physical)) allowed.push(physical);
	}
	return allowed;
}
/**
* Validate one file redirect target.
*
* The lexical checks run first (literal, non-glob, non-tilde, relative only
* when safe), then the physical checks: the parent directory must exist, the
* resolved candidate must stay inside a writable root, and the final component
* must not be a symbolic link (a dangling link would let the shell create the
* link's target outside every root).
* @param target - the quote-removed redirect target.
* @param options - workdir, writable roots and the relative-target policy.
* @returns the verdict, with a frozen reason code on refusal.
*/
async function checkRedirectTarget(target, options) {
	if (target === "") return {
		ok: false,
		code: "redirect:outside",
		detail: "an empty target"
	};
	if (GLOB_CHARACTER.test(target)) return {
		ok: false,
		code: "redirect:glob",
		detail: target
	};
	if (target.includes("~")) return {
		ok: false,
		code: "redirect:tilde",
		detail: target
	};
	const relative = !isAbsolute(target);
	if (relative) {
		if (!options.allowRelative) return {
			ok: false,
			code: "redirect:relative-cwd",
			detail: target
		};
		if (!isAbsolute(options.workdir)) return {
			ok: false,
			code: "redirect:relative-cwd",
			detail: target
		};
	}
	const absolute = resolve(relative ? options.workdir : "/", target);
	const name = basename(absolute);
	if (name === "" || name === "." || name === "..") return {
		ok: false,
		code: "redirect:outside",
		detail: target
	};
	try {
		const physicalParent = await physicalPath(dirname(absolute));
		if (physicalParent === void 0) return {
			ok: false,
			code: "redirect:parent-missing",
			detail: target
		};
		const allowed = await collectWritableRoots(options.roots);
		const candidate = join(physicalParent, name);
		if (!isInsideWritableRoots(candidate, allowed)) return {
			ok: false,
			code: "redirect:outside",
			detail: target
		};
		if ((await entryInfo(candidate))?.isSymbolicLink() === true) return {
			ok: false,
			code: "redirect:symlink",
			detail: target
		};
		return { ok: true };
	} catch {
		return {
			ok: false,
			code: "redirect:fs-error",
			detail: target
		};
	}
}
//#endregion
//#region lib/types/audit/parser.js
/**
* Recursive-descent parser for the P1 exempt-shell subset
* (`docs/script-audit-spec.md` §9). It consumes the token stream produced by
* `lexer.ts` and refuses every grammar shape the frozen subset does not name —
* unknown reserved words, stray operators, empty commands, malformed control
* flow — instead of guessing what bash would do.
*
* The only AST the analyzer needs is the flat, source-ordered list of simple
* commands (with their assignments, words and redirects): control-flow bodies
* are validated structurally here and their simple commands are appended in
* order, which is exactly what "audit every command, then every redirect"
* requires.
*/
const REDIRECT_OPERATORS = new Set([
	">",
	">>",
	">|",
	"<>",
	"<",
	">&",
	"<&",
	"&>",
	"&>>",
	"<<",
	"<<<"
]);
/** Reserved words that are valid only where the grammar expects them; a stray
* one at command position is an empty/unsupported command. */
const RESERVED_AT_COMMAND = new Set([
	"then",
	"do",
	"done",
	"fi",
	"else",
	"elif",
	"esac",
	"in"
]);
/** Terminators that may follow a command without a `;`/newline (`)` closes a
* subshell, and the case terminators follow the body directly). */
function terminatorNeedsSeparator(token) {
	if (token.type === "word") return true;
	if (token.type === "op") return token.value !== ")" && token.value !== ";;" && token.value !== ";&" && token.value !== ";;&";
	return false;
}
/**
* Parse one `bash -c` source into the spec subset.
* @param source - the exact command source.
* @returns the flat, source-ordered command list.
* @throws AuditError on any construct outside the frozen subset.
*/
function parseScript(source) {
	const lexed = tokenize(source);
	return new Parser(lexed.tokens, lexed.heredocs).parse();
}
var Parser = class {
	tokens;
	heredocs;
	index = 0;
	commands = [];
	/** Count of parsed command-like constructs, including `[[ … ]]` (which has
	* no simple command) so empty control-flow bodies can be detected. */
	constructs = 0;
	constructor(tokens, heredocs) {
		this.tokens = tokens;
		this.heredocs = heredocs;
	}
	parse() {
		this.parseList(/* @__PURE__ */ new Set());
		if (this.index < this.tokens.length) fail("syntax:unsupported", `unexpected ${this.describe(this.peek())}`);
		if (this.constructs === 0) fail("syntax:empty-command", "no command");
		return { commands: this.commands };
	}
	peek(offset = 0) {
		return this.tokens[this.index + offset];
	}
	atEnd(offset = 0) {
		return this.index + offset >= this.tokens.length;
	}
	describe(token) {
		if (token === void 0) return "end of input";
		if (token.type === "newline") return "a newline";
		if (token.type === "op") return `"${token.value}"`;
		return `"${token.word.value}"`;
	}
	isTerminator(token, terminators) {
		if (token.type === "newline") return false;
		return terminators.has(token.type === "word" ? token.word.value : token.value);
	}
	skipNewlines() {
		while (this.peek()?.type === "newline") this.index += 1;
	}
	/**
	* Parse a statement list up to (not including) one of `terminators`.
	* Blank lines and a trailing separator are accepted; a missing required
	* terminator is refused.
	*/
	parseList(terminators) {
		this.skipNewlines();
		if (this.atEnd()) {
			this.rejectUnterminated(terminators);
			return;
		}
		if (this.isTerminator(this.peek(), terminators)) return;
		while (true) {
			this.parseAndOr();
			let sawSeparator = false;
			while (true) {
				const token = this.peek();
				if (token === void 0) break;
				if (token.type === "newline" || token.type === "op" && token.value === ";") {
					this.index += 1;
					sawSeparator = true;
					continue;
				}
				break;
			}
			const token = this.peek();
			if (token === void 0) {
				this.rejectUnterminated(terminators);
				return;
			}
			if (this.isTerminator(token, terminators)) {
				if (!sawSeparator && terminatorNeedsSeparator(token)) fail("syntax:unsupported", `unexpected ${this.describe(token)} without a separator`);
				return;
			}
			if (!sawSeparator) fail("syntax:unsupported", `unexpected ${this.describe(token)}`);
		}
	}
	rejectUnterminated(terminators) {
		if (terminators.size === 0) return;
		fail("syntax:unsupported", `unexpected end of input (expected ${[...terminators].join(" or ")})`);
	}
	parseAndOr() {
		this.parsePipeline();
		while (true) {
			const token = this.peek();
			if (token?.type !== "op" || token.value !== "&&" && token.value !== "||") return;
			this.index += 1;
			this.skipNewlines();
			this.parsePipeline();
		}
	}
	parsePipeline() {
		this.skipNegations();
		this.skipTimePrefix();
		this.skipNegations();
		this.parseCommand();
		while (true) {
			const token = this.peek();
			if (token?.type !== "op" || token.value !== "|") return;
			this.index += 1;
			this.skipNewlines();
			this.skipNegations();
			this.skipTimePrefix();
			this.skipNegations();
			this.parseCommand();
		}
	}
	skipNegations() {
		while (true) {
			const token = this.peek();
			if (token?.type !== "word" || token.word.quoted || token.word.value !== "!") return;
			this.index += 1;
		}
	}
	skipTimePrefix() {
		const token = this.peek();
		if (token?.type !== "word" || token.word.quoted || token.word.value !== "time") return;
		this.index += 1;
		const option = this.peek();
		if (option?.type === "word" && !option.word.quoted && !option.word.expanded && option.word.value === "-p") this.index += 1;
	}
	parseCommand() {
		const token = this.peek();
		if (token === void 0) fail("syntax:empty-command", "expected a command");
		if (token.type === "newline") fail("syntax:empty-command", "an empty command");
		if (token.type === "op") {
			if (token.value === "(") {
				this.index += 1;
				this.parseSubshell();
				return;
			}
			if (token.value === "{") {
				this.index += 1;
				this.parseGroup();
				return;
			}
			if (REDIRECT_OPERATORS.has(token.value)) {
				this.parseSimple();
				return;
			}
			fail("syntax:empty-command", `unexpected ${this.describe(token)}`);
		}
		const word = token.word;
		if (!word.quoted) {
			if (word.value === "if") {
				this.index += 1;
				this.parseIf();
				return;
			}
			if (word.value === "for") {
				this.index += 1;
				this.parseFor();
				return;
			}
			if (word.value === "while" || word.value === "until") {
				this.index += 1;
				this.parseWhile();
				return;
			}
			if (word.value === "case") {
				this.index += 1;
				this.parseCase();
				return;
			}
			if (word.value === "[[") {
				this.index += 1;
				this.parseTest();
				return;
			}
			if (word.value === "function") fail("syntax:function", "function definitions are not allowed");
			if (word.value === "select") fail("syntax:select", "`select` is not supported");
			if (word.value === "coproc") fail("syntax:coproc", "`coproc` is not supported");
			if (word.value === "]]") fail("syntax:unsupported", "a \"]]\" without \"[[\"");
			if (RESERVED_AT_COMMAND.has(word.value)) fail("syntax:empty-command", `unexpected reserved word "${word.value}"`);
		}
		this.parseSimple();
	}
	parseSimple() {
		const assignments = [];
		const words = [];
		const redirects = [];
		while (true) {
			const token = this.peek();
			if (token === void 0 || token.type === "newline") break;
			if (token.type === "word") {
				if (words.length === 0 && token.word.assignmentName !== void 0) assignments.push({
					name: token.word.assignmentName,
					word: token.word
				});
				else words.push(token.word);
				this.index += 1;
				continue;
			}
			if (!REDIRECT_OPERATORS.has(token.value)) break;
			redirects.push(this.parseRedirect());
		}
		if (assignments.length === 0 && redirects.length === 0 && words.length === 1) {
			const open = this.peek();
			const close = this.peek(1);
			if (open?.type === "op" && open.value === "(" && close?.type === "op" && close.value === ")") fail("syntax:function", `function definition "${words[0]?.value}()"`);
		}
		if (assignments.length === 0 && redirects.length === 0 && words.length === 0) fail("syntax:empty-command", "an empty command");
		this.commands.push({
			assignments,
			words,
			redirects
		});
		this.constructs += 1;
	}
	requireRedirectWord(what) {
		const token = this.peek();
		if (token?.type !== "word") fail("syntax:redirect-form", `missing ${what}`);
		this.index += 1;
		return token.word;
	}
	parseRedirect() {
		const opIndex = this.index;
		const token = this.tokens[opIndex];
		this.index += 1;
		const operator = token.value;
		if (operator === "<<") {
			const delimiter = this.requireRedirectWord("a heredoc delimiter");
			const body = this.heredocs.get(opIndex);
			if (body === void 0) fail("syntax:redirect-form", "a heredoc without a body");
			return {
				kind: "heredoc",
				operator: "<<",
				delimiter: delimiter.value,
				quoted: body.quoted,
				body: body.body
			};
		}
		if (operator === "<<<") return {
			kind: "herestring",
			operator: "<<<",
			target: this.requireRedirectWord("a here-string word")
		};
		const target = this.requireRedirectWord("a redirection target");
		const literal = !target.expanded && !target.glob && !target.tilde;
		if (operator === ">&" || operator === "<&") {
			if (literal && /^[0-9]+$/.test(target.value)) return {
				kind: "fd",
				operator,
				target: target.value
			};
			if (literal && target.value === "-") return {
				kind: "close",
				operator,
				target: "-"
			};
			if (target.value === "/dev/null") return {
				kind: "null",
				operator
			};
			return {
				kind: "file",
				operator,
				target
			};
		}
		if (target.value === "/dev/null") return {
			kind: "null",
			operator
		};
		return {
			kind: "file",
			operator,
			target
		};
	}
	expectWord(value, message) {
		const token = this.peek();
		if (token?.type !== "word" || token.word.quoted || token.word.value !== value) fail("syntax:unsupported", message);
		this.index += 1;
	}
	parseIf() {
		const before = this.constructs;
		this.parseList(new Set(["then"]));
		if (this.constructs === before) fail("syntax:empty-command", "an \"if\" without a condition");
		this.expectWord("then", "expected \"then\"");
		this.parseList(new Set([
			"elif",
			"else",
			"fi"
		]));
		while (true) {
			const token = this.peek();
			if (token?.type === "word" && !token.word.quoted && token.word.value === "elif") {
				this.index += 1;
				const branchStart = this.constructs;
				this.parseList(new Set(["then"]));
				if (this.constructs === branchStart) fail("syntax:empty-command", "an \"elif\" without a condition");
				this.expectWord("then", "expected \"then\"");
				this.parseList(new Set([
					"elif",
					"else",
					"fi"
				]));
				continue;
			}
			if (token?.type === "word" && !token.word.quoted && token.word.value === "else") {
				this.index += 1;
				this.parseList(new Set(["fi"]));
				continue;
			}
			if (token?.type === "word" && !token.word.quoted && token.word.value === "fi") {
				this.index += 1;
				this.constructs += 1;
				return;
			}
			fail("syntax:unsupported", "an \"if\" without \"fi\"");
		}
	}
	parseFor() {
		const nameToken = this.peek();
		if (nameToken?.type !== "word") fail("syntax:unsupported", "a \"for\" loop without a variable name");
		const variable = nameToken.word;
		if (variable.quoted || variable.expanded || variable.glob || variable.tilde || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.value)) fail("syntax:unsupported", `invalid "for" variable ${JSON.stringify(variable.value)}`);
		this.index += 1;
		const inToken = this.peek();
		if (inToken?.type === "word" && !inToken.word.quoted && inToken.word.value === "in") {
			this.index += 1;
			while (true) {
				const token = this.peek();
				if (token === void 0 || token.type === "newline" || token.type === "op" && token.value === ";") break;
				if (token.type !== "word") fail("syntax:unsupported", `unexpected ${this.describe(token)} in a "for" word list`);
				this.index += 1;
			}
		}
		while (true) {
			const token = this.peek();
			if (token?.type === "newline" || token?.type === "op" && token.value === ";") {
				this.index += 1;
				continue;
			}
			break;
		}
		this.expectWord("do", "expected \"do\"");
		this.parseList(new Set(["done"]));
		this.expectWord("done", "expected \"done\"");
		this.constructs += 1;
	}
	parseWhile() {
		const before = this.constructs;
		this.parseList(new Set(["do"]));
		if (this.constructs === before) fail("syntax:empty-command", "a loop without a condition");
		this.expectWord("do", "expected \"do\"");
		this.parseList(new Set(["done"]));
		this.expectWord("done", "expected \"done\"");
		this.constructs += 1;
	}
	parseCase() {
		if (this.peek()?.type !== "word") fail("syntax:unsupported", "a \"case\" without a subject");
		this.index += 1;
		this.expectWord("in", "expected \"in\" after a \"case\" subject");
		while (true) {
			this.skipNewlines();
			const token = this.peek();
			if (token === void 0) fail("syntax:unsupported", "a \"case\" without \"esac\"");
			if (token.type === "word" && !token.word.quoted && token.word.value === "esac") {
				this.index += 1;
				this.constructs += 1;
				return;
			}
			if (token.type === "op" && token.value === "(") {
				this.index += 1;
				this.skipNewlines();
			}
			while (true) {
				if (this.peek()?.type !== "word") fail("syntax:unsupported", "a case pattern is expected");
				this.index += 1;
				const separator = this.peek();
				if (separator?.type === "op" && separator.value === "|") {
					this.index += 1;
					continue;
				}
				if (separator?.type === "op" && separator.value === ")") {
					this.index += 1;
					break;
				}
				fail("syntax:unsupported", "a case pattern must end with \")\"");
			}
			this.parseList(new Set([
				";;",
				";&",
				";;&",
				"esac"
			]));
			const after = this.peek();
			if (after?.type === "op" && (after.value === ";;" || after.value === ";&" || after.value === ";;&")) {
				this.index += 1;
				continue;
			}
			if (after?.type === "word" && !after.word.quoted && after.word.value === "esac") {
				this.index += 1;
				this.constructs += 1;
				return;
			}
			if (after === void 0) fail("syntax:unsupported", "a \"case\" without \"esac\"");
			fail("syntax:unsupported", `unexpected ${this.describe(after)} in a "case" body`);
		}
	}
	parseGroup() {
		const before = this.constructs;
		this.parseList(new Set(["}"]));
		if (this.constructs === before) fail("syntax:empty-command", "an empty \"{ }\" group");
		const close = this.peek();
		if (close?.type !== "op" || close.value !== "}") fail("syntax:unsupported", "expected \"}\"");
		this.index += 1;
		this.constructs += 1;
	}
	parseSubshell() {
		this.parseList(new Set([")"]));
		const close = this.peek();
		if (close?.type !== "op" || close.value !== ")") fail("syntax:unsupported", "expected \")\"");
		this.index += 1;
		this.constructs += 1;
	}
	parseTest() {
		while (true) {
			const token = this.peek();
			if (token === void 0) fail("syntax:unsupported", "an unterminated \"[[\"");
			if (token.type === "word" && !token.word.quoted && token.word.value === "]]") {
				this.index += 1;
				this.constructs += 1;
				return;
			}
			if (token.type === "op" && (token.value === "<<" || token.value === "<<<")) fail("syntax:unsupported", "a heredoc inside \"[[\" is not supported");
			this.index += 1;
		}
	}
};
//#endregion
//#region lib/types/audit/index.js
/**
* P1 static audit for one `bash -c` source (`docs/script-audit-spec.md`).
*
* `auditCommand` decides whether one call may run outside the sandbox. It is
* pure apart from the physical path checks (`node:fs/promises` realpath/lstat)
* and never spawns a shell: the lexer/parser hand-write the allowed subset and
* the analyzer refuses everything they do not cover (fail closed).
*
* Check order is fixed by the spec so the first, most actionable reason wins:
*  1. parse refusals (whole source),
*  2. command/entry checks in source order (assignments, command words,
*     entries, denied programs, absolute-path physical checks),
*  3. redirect checks in source order (literal, then physical containment).
*/
function failure(code, detail) {
	return detail === void 0 ? {
		exempt: false,
		code
	} : {
		exempt: false,
		code,
		detail
	};
}
function decisionFromError(error) {
	if (error instanceof AuditError) return failure(error.code, error.detail);
	return failure("syntax:unsupported", error instanceof Error ? error.message : String(error));
}
/**
* Audit one `bash -c` source against the operator whitelist and writable roots.
* @param command - the exact source the bash tool was asked to run.
* @param context - live entries, resolved workdir and writable roots.
* @returns `{ exempt: true, code: 'ok' }` only when the whole call satisfies the
*   spec; otherwise the first refusal with its frozen reason code.
*/
async function auditCommand(command, context) {
	let program;
	try {
		program = parseScript(command);
	} catch (error) {
		return decisionFromError(error);
	}
	try {
		const commandDecision = await auditSimpleCommands(program, context);
		if (commandDecision !== void 0) return commandDecision;
		return await auditRedirects(program, context);
	} catch (error) {
		return decisionFromError(error);
	}
}
/** Command/entry checks for every simple command, in source order. */
async function auditSimpleCommands(program, context) {
	for (const simple of program.commands) {
		if (simple.words.length === 0) {
			for (const assignment of simple.assignments) if (isSensitiveAssignmentName(assignment.name)) return failure("syntax:sensitive-assignment", assignment.name);
			if (simple.redirects.length > 0) return failure("match:empty-program", "a redirect without a command word");
			continue;
		}
		if (simple.assignments.length > 0) return failure("syntax:prefix-assignment", simple.assignments[0]?.name);
		const decision = await auditCommandWord(simple.words, context);
		if (decision !== void 0) return decision;
	}
}
/** Whether one entry's literal token prefix equals the command's leading words. */
function entryMatches(words, entry) {
	if (entry.tokens.length === 0 || entry.tokens.length > words.length) return false;
	for (let index = 0; index < entry.tokens.length; index += 1) {
		const word = words[index];
		if (word === void 0 || word.expanded || word.glob || word.tilde) return false;
		if (word.value !== entry.tokens[index]) return false;
	}
	return true;
}
/** Command-word checks for one simple command. */
async function auditCommandWord(words, context) {
	const word = words[0];
	if (word.value === "") return failure("match:empty-program");
	if (word.expanded) return failure("match:dynamic-command", word.value);
	if (word.glob) return failure("match:dynamic-command", word.value);
	if (word.tilde) return failure("match:tilde-command", word.value);
	if (!isAbsolute(word.value) && (word.value.includes("/") || word.value === "..")) return failure("match:relative-command", word.value);
	const matched = context.entries.some((entry) => entryMatches(words, entry));
	const args = words.slice(1).map((argument) => argument.value);
	const denied = classifyDeniedProgram(word.value);
	if (denied !== void 0) {
		if (matched) return failure("match:denied-program", word.value);
		return failure(denied.code, word.value);
	}
	if (isDeniedProgram(word.value, args)) return failure("program:environment", word.value);
	if (!matched) return failure("match:no-entry", word.value);
	if (isAbsolute(word.value)) return checkAbsoluteCommand(word.value, context);
}
/**
* Physical checks for an absolute command word: it must exist as a regular
* file and must not be model-writable, so an edited workspace script (or temp
* script) can never be whitelisted by absolute path.
*/
async function checkAbsoluteCommand(word, context) {
	try {
		const physical = await realpath(word);
		if (!(await stat(physical)).isFile()) return failure("match:absolute-not-writable", word);
		if (isInsideWritableRoots(physical, await collectWritableRoots(context))) return failure("match:absolute-model-writable", word);
		return;
	} catch {
		return failure("match:absolute-not-writable", word);
	}
}
/** Redirect checks for every file redirect, in source order. */
async function auditRedirects(program, context) {
	const mutatesCwd = program.commands.some((simple) => simple.words.length > 0 && isCwdMutator(simple.words[0]?.value ?? ""));
	const workdir = typeof context.workdir === "string" ? context.workdir : "";
	for (const simple of program.commands) for (const redirect of simple.redirects) {
		if (redirect.kind !== "file") continue;
		const target = redirect.target;
		if (target.expanded) return failure("redirect:dynamic", target.value);
		if (target.glob) return failure("redirect:glob", target.value);
		if (target.tilde) return failure("redirect:tilde", target.value);
		const checked = await checkRedirectTarget(target.value, {
			workdir,
			roots: context,
			allowRelative: !mutatesCwd
		});
		if (!checked.ok) return failure(checked.code, checked.detail);
	}
	return {
		exempt: true,
		code: "ok"
	};
}
//#endregion
//#region lib/types/explain.js
/** One-line reason, phrased to follow "not exempt: ". */
const SUMMARIES = {
	"syntax:command-substitution": "command substitution (`$(...)`) is not allowed",
	"syntax:backtick": "backtick substitution is not allowed",
	"syntax:arithmetic": "arithmetic expansion is not allowed",
	"syntax:process-substitution": "process substitution (`<(...)`) is not allowed",
	"syntax:background": "background `&` is not allowed",
	"syntax:function": "function definitions are not allowed",
	"syntax:alias": "alias definitions are not allowed",
	"syntax:select": "`select` is not supported",
	"syntax:coproc": "`coproc` is not supported",
	"syntax:prefix-assignment": "prefix assignments (`VAR=... cmd`) are not allowed",
	"syntax:sensitive-assignment": "would change shell or loader resolution",
	"syntax:param-operator": "that `${...}` form is not supported",
	"syntax:unsupported": "this construct is not in the exempt subset",
	"syntax:unterminated-quote": "a quote is unterminated",
	"syntax:control-char": "a control character is not supported",
	"syntax:empty-command": "an empty command or separator is not supported",
	"syntax:redirect-form": "that redirection form is not supported",
	"match:no-entry": "is not whitelisted",
	"match:dynamic-command": "the command word is not a literal",
	"match:relative-command": "relative command paths are not allowed",
	"match:tilde-command": "`~` command paths are not allowed",
	"match:denied-program": "is never exempt",
	"match:empty-program": "the command word is missing",
	"match:absolute-not-writable": "the absolute command does not exist or is not a regular file",
	"match:absolute-model-writable": "the absolute command is inside a model-writable area",
	"redirect:outside": "the redirect target is outside the writable roots",
	"redirect:parent-missing": "the redirect target parent directory does not exist",
	"redirect:symlink": "the redirect target is a symbolic link",
	"redirect:relative-cwd": "a relative redirect after a cwd change is not allowed",
	"redirect:dynamic": "the redirect target is not a literal",
	"redirect:glob": "a glob in a redirect target is not allowed",
	"redirect:tilde": "`~` in a redirect target is not allowed",
	"redirect:fs-error": "the redirect target could not be verified",
	"program:dynamic-exec": "can execute arbitrary commands",
	"program:environment": "can change shell or loader resolution",
	"program:forwarder": "forwards arbitrary commands"
};
/** One concrete rewrite step for the model. */
const REWRITES = {
	"syntax:command-substitution": "run the inner command as its own bash call and use its output in the next call.",
	"syntax:backtick": "run the inner command as its own bash call and use its output in the next call.",
	"syntax:arithmetic": "compute the value in a separate call or inline a literal.",
	"syntax:process-substitution": "use a temporary file inside the workspace instead.",
	"syntax:background": "run that part with `run_in_background: true`, then use `job_output` / `job_kill`.",
	"syntax:function": "inline the commands or move them to separate calls.",
	"syntax:alias": "write the full command instead of defining an alias.",
	"syntax:select": "rewrite it as a `for` loop or as separate calls.",
	"syntax:coproc": "move the background process to `run_in_background`.",
	"syntax:prefix-assignment": "drop the assignment; pass values as literal arguments instead.",
	"syntax:sensitive-assignment": "do not assign that variable; use the inherited environment or a literal.",
	"syntax:param-operator": "use a plain `$VAR`/`${VAR}`, or handle the default with an `if`.",
	"syntax:unsupported": "split the logic into simple commands (see the sandbox scripting rules).",
	"syntax:unterminated-quote": "close the quote and retry.",
	"syntax:control-char": "remove the control character.",
	"syntax:empty-command": "remove the empty statement/separator.",
	"syntax:redirect-form": "use `>`, `>>`, `<`, or redirect to `/dev/null`.",
	"match:no-entry": "ask the operator to add that command to 设置 → 沙箱白名单 → 免沙箱命令, or use an allowed command.",
	"match:dynamic-command": "write the program name literally (no expansions in the command word).",
	"match:relative-command": "use the bare command name or an absolute path.",
	"match:tilde-command": "use the bare command name or an absolute path.",
	"match:denied-program": "use a different program; this one cannot be exempt.",
	"match:empty-program": "write the command name.",
	"match:absolute-not-writable": "check that the absolute path exists and is executable.",
	"match:absolute-model-writable": "whitelist an installed command instead of a script inside the workspace.",
	"redirect:outside": "redirect to an absolute path inside the workspace (or an extra writable root).",
	"redirect:parent-missing": "create the parent directory first, or redirect into an existing one.",
	"redirect:symlink": "redirect to a regular file path, not a symbolic link.",
	"redirect:relative-cwd": "use an absolute target, or remove the `cd`/`pushd`/`popd` from the call.",
	"redirect:dynamic": "use a literal absolute path.",
	"redirect:glob": "use a literal absolute path without glob characters.",
	"redirect:tilde": "use an absolute path instead of `~`.",
	"redirect:fs-error": "use an existing absolute path inside the workspace.",
	"program:dynamic-exec": "use a different program; this one cannot be exempt.",
	"program:environment": "use a different program; this one cannot be exempt.",
	"program:forwarder": "call the target command directly instead of forwarding through this one."
};
function compact(detail) {
	if (detail === void 0) return void 0;
	const value = detail.replace(/\s+/g, " ").trim();
	return value === "" ? void 0 : value.slice(0, 120);
}
function summaryFor(code, detail) {
	switch (code) {
		case "match:no-entry": return `no operator-whitelisted entry for ${detail === void 0 ? "the command" : `"${detail}"`}`;
		case "match:denied-program":
		case "program:dynamic-exec":
		case "program:environment":
		case "program:forwarder": return `${detail === void 0 ? "this program" : `"${detail}"`} ${SUMMARIES[code]}`;
		case "syntax:sensitive-assignment": return `assigning ${detail === void 0 ? "a resolver variable" : `"${detail}"`} ${SUMMARIES[code]}`;
		default: return detail === void 0 ? SUMMARIES[code] : `${SUMMARIES[code]} (${detail})`;
	}
}
/**
* Render the denial hint for one refusal decision.
* @param decision - the audit decision for the call that was denied.
* @param options - escalation availability.
* @returns a 2–3 line hint, or undefined when the decision is exempt.
*/
function renderAuditHint(decision, options = {}) {
	if (decision.exempt || decision.code === "ok") return void 0;
	const code = decision.code;
	const lines = [`[sandbox-explain] not exempt: ${summaryFor(code, compact(decision.detail))}.`, `rewrite: ${REWRITES[code]}`];
	if (options.escalation === true) lines.push("or: request sandbox_permissions=\"danger-full-access\" with a justification (requires user approval).");
	return lines.join("\n");
}
//#endregion
//#region lib/types/guide.js
/** The P1 scripting contract injected as a system-prompt section. */
const SCRIPT_GUIDE = [
	"Outside-sandbox bash: a call is exempt only when every command word is a literal operator-whitelisted name (bare or absolute) and the whole call stays in this subset:",
	"- allowed: `;`, `&&`, `||`, `|`, if/case/for/while, comments, literal/quoted args, `$NAME`/`${NAME}` without command substitution, heredocs, `cd`, redirects to `/dev/null` or to literal paths inside the workspace (absolute, or relative when no cd/pushd/popd runs);",
	"- forbidden: `$(...)`, backticks, arithmetic, process substitution, eval/source/./exec/command/builtin, export/declare/set/hash/enable/trap/alias, function definitions, prefix assignments, background `&`, relative or dynamic command words/redirect targets.",
	"Use `run_in_background` for long or live processes. If a sandboxed call is denied, the result explains why it was not exempt; rewrite it or ask the operator to whitelist the command. Escalation needs user approval."
].join("\n");
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
		const decision = await auditCommand(spec.command, {
			entries: this.commands.entries,
			workdir: spec.workdir,
			workspaceRoot: policy.workspaceRoot,
			extraWritableRoots: this.rootsSource.roots,
			additionalWritableRoots: policy.additionalWritableRoots
		});
		if (!decision.exempt) this.logger?.debug?.(`dsh-whitelist-sandbox: not exempt (${decision.code}${decision.detail === void 0 ? "" : `: ${decision.detail}`})`);
		return decision.exempt;
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
/** Whether a bash result carries the sandbox's file-denial evidence. */
function sandboxDenied(result) {
	const value = result.value;
	if (value !== null && typeof value === "object" && value.sandbox?.denied === true) return true;
	return result.content.some((block) => block.type === "text" && typeof block.text === "string" && block.text.includes("[sandbox: file access denied under "));
}
/** Append one text block to an accepted result decision (never replaces values). */
function appendHint(decision, result, hint) {
	if (decision.kind !== "accept" || Object.hasOwn(decision, "value")) return decision;
	const content = decision.content ?? result.content;
	return {
		...decision,
		content: [...content, {
			type: "text",
			text: hint
		}]
	};
}
/**
* Post-execute policy: when a sandboxed bash call was denied, recompute the P1
* audit decision for its command and append a short "why not exempt + rewrite /
* escalate" hint. Every other call and every successful/other failure is left
* untouched; the hint never grants anything.
*/
function installDenialHint(ctx, commands, roots, logger) {
	ctx.on("tools/post-execute", async (exec, result, next) => {
		const decision = await next();
		try {
			if (exec.name !== "bash" || result.isError || !sandboxDenied(result)) return decision;
			const args = exec.arguments;
			if (args === null || typeof args !== "object" || typeof args.command !== "string") return decision;
			const requested = typeof args.workdir === "string" ? args.workdir : void 0;
			let session;
			if (requested === void 0 || !isAbsolute(requested)) {
				const service = ctx.get("workingDirectory");
				if (exec.agent !== void 0 && service !== void 0) try {
					session = await service.ensure(exec.agent, exec.signal);
				} catch {
					session = void 0;
				}
			}
			const workdir = requested === void 0 ? session ?? process.cwd() : isAbsolute(requested) ? requested : join(session ?? process.cwd(), requested);
			const policy = ctx.sandboxPolicy.resolve(exec.agent === void 0 ? {} : { session: exec.agent.session });
			const audit = await auditCommand(args.command, {
				entries: commands.entries,
				workdir,
				workspaceRoot: policy.workspaceRoot,
				extraWritableRoots: roots.roots,
				additionalWritableRoots: policy.additionalWritableRoots
			});
			if (audit.exempt) return decision;
			const hint = renderAuditHint(audit, { escalation: true });
			if (hint === void 0) return decision;
			logger.debug?.(`dsh-whitelist-sandbox: denial hint ${audit.code}`);
			return appendHint(decision, result, hint);
		} catch (error) {
			logger.debug?.(`dsh-whitelist-sandbox: denial hint skipped (${String(error)})`);
			return decision;
		}
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
	installDenialHint(ctx, commandSource, rootsSource, logger);
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
				if (commands.length > 0) lines.push(`Commands matching these prefixes run directly on the host, outside the file sandbox (the exempt subset is described in the whitelist scripting rules): ${commands.map((entry) => entry.source).join(", ")}`);
				return lines.join("\n");
			}
		});
		scope.systemPrompt.section({
			name: "whitelist:script-guide",
			order: scope.systemPrompt.getSectionOrder("TOOL_BASH") + 5,
			text: SCRIPT_GUIDE
		});
	});
	const applied = rootsSource.roots;
	const commands = commandSource.entries;
	ctx.logger.info(`dsh-whitelist-sandbox: ${applied.length} extra writable root(s)${applied.length > 0 ? ` (${applied.join(", ")})` : ""}`);
	ctx.logger.info(`dsh-whitelist-sandbox: ${commands.length} unsandboxed command prefix(es)${commands.length > 0 ? ` (${commands.map((entry) => entry.source).join(", ")})` : ""}`);
}
//#endregion
export { Config, SETTINGS_ENTRY, WhitelistBashExecutor, WhitelistFileSystem, WhitelistRoots, apply, assertSafeWhitelistRoots, assertSupportedWhitelistPlatform, canonicalizeExtraRoots, inject, injectExtraRootGrants, installDenialHint, name };

//# sourceMappingURL=index.js.map