import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import * as crypto from "node:crypto";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import * as os from "node:os";
//#region lib/types/host/attribution.js
/**
* Depth cap for the parent-lineage walk. Subagent delegation is bounded by
* the runtime's recursion budget; the cap only guards against corrupt or
* cyclic lineage metadata looping forever.
*/
const MAX_ATTRIBUTION_DEPTH = 16;
/**
* True when the session was created as a subagent child. This is the coarse
* durable classification stamped at creation (`SessionHeader.origin`), not a
* runtime ownership probe, so it survives restart and resume.
*/
function isSubagentSession(session) {
	return session.header?.origin === "subagent";
}
/**
* The session a modification is attributed to. Subagent sessions are folded
* into their main (top-level) session by walking the durable `parentSession`
* lineage, so every write/edit a subagent performs shows up in the main
* agent's modification list and turn coordinates instead of a separate,
* mostly invisible subagent session list. Sessions without subagent origin
* (main sessions, forks) are their own attribution target; a subagent whose
* parent chain is not live falls back to itself, preserving pre-fold
* behaviour for orphan sessions.
*/
function attributionSession(ctx, session) {
	let current = session;
	for (let depth = 0; depth < MAX_ATTRIBUTION_DEPTH && isSubagentSession(current); depth += 1) {
		const parentId = current.header?.parentSession;
		if (parentId === void 0) return current;
		const parent = ctx.sessions?.get(parentId);
		if (parent === void 0 || parent.id === current.id) return current;
		current = parent;
	}
	return current;
}
/** The newest tracked write/edit call per path; `calls` is in chain order. */
function newestCalls(calls) {
	const newest = /* @__PURE__ */ new Map();
	for (const call of calls) {
		const previous = newest.get(call.path);
		if (previous === void 0 || call.seq >= previous.seq) newest.set(call.path, call);
	}
	return newest;
}
/**
* Post-image blob of each call, keyed by `callId`. Deletions map to
* `undefined`; calls without a usable post-image are absent from the map so
* callers can tell "the call removed the file" from "nothing recorded".
*/
async function callPostImages(provider, calls) {
	const result = /* @__PURE__ */ new Map();
	const pending = [];
	for (const call of calls) {
		if (call.deleted === true) {
			result.set(call.callId, void 0);
			continue;
		}
		if (call.blob !== void 0) {
			result.set(call.callId, call.blob);
			continue;
		}
		if (call.commit !== void 0) pending.push(call);
	}
	if (pending.length > 0) {
		const hashes = await provider.blobHashes(pending.map((call) => ({
			treeish: call.commit,
			path: call.path
		}))).catch(() => new Array(pending.length));
		pending.forEach((call, index) => result.set(call.callId, hashes[index]));
	}
	return result;
}
/**
* Paths whose current content cannot be attributed to this session's newest
* write/edit call.
*
* A path without any tracked call was never written by this session's tools,
* so it is foreign. A path whose newest call has no usable post-image
* (oversized, superseded, never frozen) stays on this session's side (the
* permissive legacy semantics). Otherwise the call's post-image must equal the
* current blob; anything else — another session, an editor, bash, or a later
* overwrite — is foreign.
*
* `current` optionally supplies the worktree blob of every path (the session
* modification list already has it as `probe`); when omitted it is hashed in
* one batch.
*/
async function foreignPaths(provider, calls, paths, current) {
	const wanted = [...new Set(paths)];
	const foreign = /* @__PURE__ */ new Set();
	if (wanted.length === 0) return foreign;
	const blobs = current ?? await provider.hashBlobs(wanted).catch(() => /* @__PURE__ */ new Map());
	const newest = newestCalls(calls);
	const postImages = await callPostImages(provider, [...newest.values()]);
	for (const rel of wanted) {
		const call = newest.get(rel);
		if (call === void 0) {
			foreign.add(rel);
			continue;
		}
		if (!postImages.has(call.callId)) continue;
		if (postImages.get(call.callId) !== blobs.get(rel)) foreign.add(rel);
	}
	return foreign;
}
//#endregion
//#region lib/types/host/accept-base.js
/**
* The accept baseline of one session, held entirely in git
* (docs/git-only-plan.md §2.4, §2.5).
*
* `refs/dsh/accepted` is a commit chain whose tip tree is the accepted
* content. Accepting never touches the worktree, so it needs no workspace lock,
* no fence and no session flush. "Is this file accepted?" is a blob-hash
* comparison, which removes the fingerprint / accept-time-content bookkeeping
* the ledger used to keep.
*/
const ACCEPTED_REF = "refs/dsh/accepted";
var AcceptBase = class {
	ctx;
	snapshots;
	options;
	constructor(ctx, snapshots, options = { spawnTimeoutMs: 6e4 }) {
		this.ctx = ctx;
		this.snapshots = snapshots;
		this.options = options;
	}
	/**
	* Ensure the accepted baseline exists for a session, seeding it from the
	* turn-start tree when this is the first call. Returns the commit that the
	* ref points at (used directly as a tree-ish for diffs).
	*/
	async ensure(cwd, sessionId, seedTree, options = {}) {
		const provider = this.snapshots.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return void 0;
		const existing = await provider.readRef(ACCEPTED_REF);
		if (existing !== void 0) return existing;
		const tree = seedTree ?? (options.requireSeed === true ? void 0 : await provider.captureTree().catch(() => void 0));
		if (tree === void 0) return void 0;
		const commit = await provider.commitTree(tree, [], `dsh accepted baseline\nsession=${sessionId}\n`);
		await provider.updateRef(ACCEPTED_REF, commit);
		return commit;
	}
	/** The current accepted commit, when the baseline already exists. */
	async ref(cwd, sessionId) {
		const provider = this.snapshots.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return void 0;
		return provider.readRef(ACCEPTED_REF);
	}
	/**
	* Ensure the accepted baseline and fold in the session-start blobs of paths
	* the chain base tree never captured (ignored files, paths excluded from
	* `add -A` for commitless nested repositories).
	*
	* These entries describe the state *before* the session wrote the file, so
	* they belong to the baseline exactly like the chain-base tree. Entries are
	* only added when the accepted tree does not know the path yet, which keeps a
	* user accept authoritative. Every write is a compare-and-swap and the
	* common, fully merged case is one `cat-file --batch-check`.
	*/
	async ensureBaseline(cwd, sessionId, seedTree, preImages) {
		const baseline = await this.ensure(cwd, sessionId, seedTree, { requireSeed: true });
		if (baseline === void 0 || preImages.size === 0) return {
			commit: baseline,
			merged: [],
			skipped: []
		};
		const provider = this.snapshots.providerFor(cwd, sessionId);
		const paths = [...preImages.keys()];
		const missingAgainst = async (commit) => {
			const hashes = await provider.blobHashes(paths.map((path) => ({
				treeish: commit,
				path
			}))).catch(() => paths.map(() => void 0));
			return paths.filter((_, index) => hashes[index] === void 0);
		};
		const skipped = [];
		let current = baseline;
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const missing = await missingAgainst(current);
			if (missing.length === 0) return {
				commit: current,
				merged: [],
				skipped
			};
			const tree = await provider.withScratch(async (scratch) => {
				await provider.readTree(scratch, current);
				const entries = missing.map((path) => ({
					path,
					blob: preImages.get(path)
				})).filter((entry) => entry.blob !== void 0);
				try {
					await provider.updateIndexInfo(scratch, entries);
				} catch {
					for (const entry of entries) try {
						await provider.updateIndexInfo(scratch, [entry]);
					} catch {
						skipped.push(entry.path);
					}
				}
				return provider.writeTree(scratch);
			}).catch(() => void 0);
			if (tree === void 0) return {
				commit: current,
				merged: [],
				skipped
			};
			const merged = missing.filter((path) => !skipped.includes(path));
			if (merged.length === 0) return {
				commit: current,
				merged: [],
				skipped
			};
			const commit = await provider.commitTree(tree, [current], `dsh baseline pre-images\nsession=${sessionId}\npaths=${merged.join(",")}\n`);
			if (await provider.updateRef("refs/dsh/accepted", commit, current)) return {
				commit,
				merged,
				skipped
			};
			const winner = await provider.readRef(ACCEPTED_REF);
			if (winner === void 0) return {
				commit: current,
				merged: [],
				skipped
			};
			current = winner;
		}
		return {
			commit: current,
			merged: [],
			skipped
		};
	}
	/** The accepted blob of one path (undefined = absent from the accepted tree). */
	async acceptedBlob(cwd, sessionId, relPath) {
		const commit = await this.ref(cwd, sessionId);
		if (commit === void 0) return void 0;
		return this.snapshots.providerFor(cwd, sessionId).blobHash(commit, relPath).catch(() => void 0);
	}
	/**
	* Accept the current worktree content of each path (a file that disappeared
	* is accepted as a deletion). This is the only accept path that reads the
	* worktree. The returned `blobs` map holds the accepted (post-image) blob of
	* every requested path — `undefined` for a deletion — so callers can classify
	* modifications without resolving the accepted tree again.
	*/
	async acceptPaths(cwd, sessionId, relPaths, options = {}) {
		const provider = this.snapshots.providerFor(cwd, sessionId);
		const baseline = await this.ensure(cwd, sessionId, options.seedTree, { requireSeed: true });
		if (baseline === void 0) return {
			ok: false,
			reason: "no-accepted-baseline"
		};
		const paths = [...new Set(relPaths.map((item) => provider.normalizeRelPath(item)))];
		if (paths.length === 0) return {
			ok: true,
			commit: baseline,
			blobs: /* @__PURE__ */ new Map()
		};
		const blobs = await provider.hashBlobs(paths, { write: true });
		const tree = await provider.withScratch(async (scratch) => {
			await provider.readTree(scratch, baseline);
			const entries = paths.map((rel) => {
				const blob = blobs.get(rel);
				return blob === void 0 ? { path: rel } : {
					path: rel,
					blob
				};
			});
			await provider.updateIndexInfo(scratch, entries);
			return provider.writeTree(scratch);
		});
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const current = await provider.readRef(ACCEPTED_REF);
			if (current === void 0) return {
				ok: false,
				reason: "git-unavailable"
			};
			const commit = await provider.commitTree(tree, [current], `${options.message ?? "accept"}\npaths=${paths.join(",")}\n`);
			if (await provider.updateRef("refs/dsh/accepted", commit, current)) return {
				ok: true,
				commit,
				blobs
			};
		}
		return {
			ok: false,
			reason: "accept-conflict"
		};
	}
	/**
	* Accept one patch by applying its forward diff onto the accepted tree. The
	* fast path (accepted already sits exactly before the patch) only registers
	* the patch blob; otherwise git applies the patch forward and may fall back
	* to a three-way merge, since every pre-image is in the object store.
	*/
	async acceptPatch(cwd, sessionId, relPath, patch, options = {}) {
		const provider = this.snapshots.providerFor(cwd, sessionId);
		const baseline = await this.ensure(cwd, sessionId, options.seedTree, { requireSeed: true });
		if (baseline === void 0) return {
			ok: false,
			reason: "no-accepted-baseline"
		};
		const rel = provider.normalizeRelPath(relPath);
		const accepted = await provider.blobHash(baseline, rel).catch(() => void 0);
		const fast = accepted !== void 0 && options.beforeBlob !== void 0 && accepted === options.beforeBlob && options.afterBlob !== void 0;
		const applied = await provider.withScratch(async (scratch) => {
			await provider.readTree(scratch, baseline);
			if (fast) await provider.updateIndexInfo(scratch, [{
				path: rel,
				blob: options.afterBlob
			}]);
			else if (patch.trim() !== "") {
				let result = await provider.applyCached(scratch, patch);
				if (!result.ok) result = await provider.applyCached(scratch, patch, { threeWay: true });
				if (!result.ok) return {
					ok: false,
					reason: result.stderr || "patch-conflict"
				};
			}
			return {
				ok: true,
				tree: await provider.writeTree(scratch)
			};
		});
		if (!applied.ok || applied.tree === void 0) return {
			ok: false,
			reason: applied.reason
		};
		const tree = applied.tree;
		const blob = fast ? options.afterBlob : await provider.blobHash(tree, rel).catch(() => void 0);
		const blobs = new Map([[rel, blob]]);
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const current = await provider.readRef(ACCEPTED_REF);
			if (current === void 0) return {
				ok: false,
				reason: "git-unavailable"
			};
			const commit = await provider.commitTree(tree, [current], `accept patch\npaths=${rel}\n`);
			if (await provider.updateRef("refs/dsh/accepted", commit, current)) return {
				ok: true,
				commit,
				blobs
			};
		}
		return {
			ok: false,
			reason: "accept-conflict"
		};
	}
};
//#endregion
//#region lib/types/host/errors.js
function ok(value) {
	return {
		ok: true,
		value
	};
}
function fail(code, message, fields = {}) {
	return {
		ok: false,
		error: {
			code,
			message,
			...fields
		}
	};
}
//#endregion
//#region lib/types/host/boundary.js
function resolveBoundary(session, messageId) {
	let assistant;
	for (const event of session.snapshotEvents()) {
		if (event.type !== "assistant/message") continue;
		if (event.data.message.id === messageId) assistant = event;
	}
	if (assistant === void 0) return { failure: {
		code: "message-not-found",
		message: `assistant message "${messageId}" was not found in session "${session.id}"`,
		sessionId: session.id,
		messageId
	} };
	return resolveForTurn(session, assistant.data.turn, { assistantEvent: assistant });
}
/**
* Resolve the rollback boundary of a turn by its number. Works for unfinished
* turns (a stopped/interrupted assistant message never emits `turn/end`): the
* rollback target is the turn-start snapshot and the fork anchor is the last
* completed turn end before it.
*/
function resolveBoundaryForTurn(session, turn) {
	const turnStart = session.snapshotEvents().find((event) => event.type === "turn/start" && event.data.turn === turn);
	if (turnStart === void 0) return { failure: {
		code: "turn-not-found",
		message: `turn ${turn} has no turn/start in session "${session.id}"`,
		sessionId: session.id
	} };
	return resolveForTurn(session, turn, { turnStartSeq: turnStart.seq });
}
function resolveForTurn(session, targetTurn, extras) {
	const events = session.snapshotEvents();
	const turnStart = events.find((event) => event.type === "turn/start" && event.data.turn === targetTurn);
	const anchor = findPreviousTurnEnd(events, turnStart?.seq ?? Number.MAX_SAFE_INTEGER);
	return { boundary: {
		targetTurn,
		...anchor === void 0 ? {} : { forkAtSeq: anchor.seq },
		forkAvailable: anchor !== void 0,
		...extras,
		...turnStart === void 0 ? {} : { turnStartSeq: turnStart.seq }
	} };
}
function findPreviousTurnEnd(events, beforeSeq) {
	let found;
	for (const event of events) {
		if (event.seq >= beforeSeq) break;
		if (event.type === "turn/end") found = event;
	}
	return found;
}
function boundaryInfo(boundary) {
	return {
		targetTurn: boundary.targetTurn,
		...boundary.forkAtSeq === void 0 ? {} : { forkAtSeq: boundary.forkAtSeq },
		forkAvailable: boundary.forkAvailable
	};
}
//#endregion
//#region lib/types/host/providers/git.js
const HEX_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const ZERO_SHA = "0000000000000000000000000000000000000000";
const RUNNING_OPS = [
	"MERGE_HEAD",
	"CHERRY_PICK_HEAD",
	"REVERT_HEAD",
	"BISECT_LOG"
];
function isHash(value) {
	return HEX_RE.test(value);
}
function spawnGit(cwd, args, env, timeoutMs, signal, gitDir, workTree, input) {
	const flags = [];
	if (gitDir !== void 0 && gitDir !== "") flags.push(`--git-dir=${gitDir}`);
	if (workTree !== void 0 && workTree !== "") flags.push(`--work-tree=${workTree}`);
	return new Promise((resolve, reject) => {
		const child = spawn("git", [
			"-C",
			cwd,
			...flags,
			...args
		], {
			env: {
				...env,
				GIT_TERMINAL_PROMPT: "0",
				GIT_OPTIONAL_LOCKS: "0",
				LC_ALL: "C"
			},
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			windowsHide: true
		});
		child.stdin.end(input ?? "");
		let stderr = "";
		let settled = false;
		const chunks = [];
		const onStdout = (chunk) => {
			chunks.push(chunk);
		};
		const onStderr = (chunk) => {
			stderr += chunk.toString("utf8");
		};
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill("SIGKILL");
			reject(/* @__PURE__ */ new Error(`git ${args[0] ?? ""} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		const abort = () => {
			if (settled) return;
			settled = true;
			child.kill("SIGKILL");
			reject(/* @__PURE__ */ new Error(`git ${args[0] ?? ""} aborted`));
		};
		if (signal !== void 0) {
			if (signal.aborted) {
				abort();
				return;
			}
			signal.addEventListener("abort", abort, { once: true });
		}
		child.stdout.on("data", onStdout);
		child.stderr.on("data", onStderr);
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			reject(error);
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			resolve({
				code: code ?? -1,
				stdout: Buffer.concat(chunks).toString("utf8"),
				stderr
			});
		});
	});
}
var GitProvider = class {
	cwd;
	options;
	baseEnv;
	/** Isolated snapshot repo readiness (undefined = not yet probed). */
	isolatedReady;
	/** The project's own git dir (read-only fence/head queries); null = not a git worktree. */
	projectGitDir;
	constructor(cwd, options) {
		this.cwd = cwd;
		this.options = options;
		const env = { ...process.env };
		delete env.GIT_DIR;
		delete env.GIT_WORK_TREE;
		delete env.GIT_INDEX_FILE;
		delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
		this.baseEnv = env;
		this.maxNestedRepos = Math.max(0, options.maxNestedRepos ?? 100);
	}
	/** Cap on nested repositories materialized per capture (from options). */
	maxNestedRepos;
	/**
	* Whether git snapshotting is usable. With the isolated snapshot repo this
	* no longer depends on the project being a git repository: every workspace
	* (git or not) can be captured at full fidelity, and non-git workspaces get
	* the same whole-worktree rollback capability as git ones.
	*/
	async available(signal) {
		if (this.isolatedReady !== void 0) return this.isolatedReady;
		const ready = await this.ensureIsolated(signal);
		if (ready) try {
			if (!fs.statSync(this.cwd).isDirectory()) {
				this.isolatedReady = false;
				return false;
			}
		} catch {
			this.isolatedReady = false;
			return false;
		}
		return ready;
	}
	/** Lazily create (idempotent) the session's isolated bare snapshot repo. */
	async ensureIsolated(signal) {
		const dir = this.options.isolatedRepoDir;
		if (dir === void 0 || dir === "") return false;
		if (this.isolatedReady !== void 0) return this.isolatedReady;
		const init = this.options.isolatedRepoInit;
		if (init !== void 0) this.isolatedReady = await init.catch(() => false);
		else try {
			const result = await spawnGit(this.cwd, [
				"init",
				"--bare",
				"--quiet",
				dir
			], this.baseEnv, this.options.spawnTimeoutMs, signal);
			this.isolatedReady = result.code === 0;
		} catch {
			this.isolatedReady = false;
		}
		return this.isolatedReady;
	}
	/**
	* The project HEAD, for snapshot metadata only (read-only query of the
	* project's own repo; absent in non-git workspaces).
	*/
	async head(signal) {
		const result = await this.runProject([
			"rev-parse",
			"--verify",
			"HEAD"
		], signal);
		if (result.code !== 0 || !isHash(result.stdout.trim())) return void 0;
		return result.stdout.trim();
	}
	/** Snapshot the entire worktree into a temporary-index tree object. */
	async captureTree(signal) {
		return (await this.captureTreeInfo(signal)).tree;
	}
	/**
	* Snapshot the entire worktree with nested git repositories materialized
	* as directory trees instead of gitlinks, so nested files get plain git
	* diff/restore coverage. `materialized` reports whether any nested
	* directory was spliced in. Materialization is best-effort: discovery or
	* capture failures leave the gitlinks in place, exactly like before.
	*
	* Discovery is driven entirely by git plumbing (tree inspection + exit
	* codes), never by parsing human-readable `add -A` stderr.
	*/
	async captureTreeInfo(signal) {
		const seen = /* @__PURE__ */ new Set();
		const nested = /* @__PURE__ */ new Set();
		let budget = 0;
		let capped = false;
		let materialized = false;
		const scanIndex = this.indexPath("scan");
		const materialize = async (absRoot) => {
			const isRoot = path.resolve(absRoot) === path.resolve(this.cwd);
			const captured = await this.captureWorktree(absRoot, signal, isRoot ? scanIndex : void 0);
			for (const rel of captured.nested) nested.add(path.resolve(absRoot, rel));
			const tree = captured.tree;
			const replacements = [];
			for (const rel of await this.gitlinkPaths(tree)) {
				if (budget >= this.maxNestedRepos) {
					capped = true;
					break;
				}
				const abs = path.resolve(absRoot, rel);
				const real = await fs.promises.realpath(abs).catch(() => abs);
				if (seen.has(real)) continue;
				seen.add(real);
				const probe = await spawnGit(abs, ["rev-parse", "--absolute-git-dir"], this.baseEnv, this.options.spawnTimeoutMs).catch(() => void 0);
				if (probe === void 0 || probe.code !== 0) continue;
				budget += 1;
				nested.add(abs);
				const subTree = await materialize(abs).catch(() => void 0);
				if (subTree !== void 0) {
					replacements.push({
						path: rel,
						tree: subTree
					});
					materialized = true;
				}
			}
			return replacements.length > 0 ? await this.replaceGitlinks(tree, replacements, signal) : tree;
		};
		const tree = await materialize(this.cwd);
		const roots = [...nested].map((abs) => path.relative(this.cwd, abs).split(path.sep).join("/")).filter((rel) => rel !== "" && !rel.startsWith("../")).sort();
		return {
			tree,
			materialized,
			nested: capped ? void 0 : roots
		};
	}
	/**
	* Nested git repositories under the worktree, in post-order (a repo's
	* deeper children appear before it), excluding the worktree root itself.
	* Used for display labeling. See `scanNestedRepos` for mechanics.
	*/
	async listNestedRepos(accept) {
		return this.scanNestedRepos(this.cwd, accept);
	}
	/**
	* Walk the real directory tree under `dir` (bounded, symlinks not
	* followed, `.git` entries skipped) and return nested repositories in
	* post-order, with `rel` relative to `dir`. `rev-parse` is spawned only
	* for directories that actually contain a `.git` entry (dir or gitfile),
	* so the walk cost is one lstat per directory entry.
	*/
	async scanNestedRepos(dir, accept) {
		const found = [];
		const MAX_VISITS = 1e6;
		let visits = 0;
		const hasGitEntry = async (abs) => {
			try {
				const stat = await fs.promises.lstat(path.join(abs, ".git"));
				return stat.isDirectory() || stat.isFile();
			} catch {
				return false;
			}
		};
		const walk = async (current) => {
			if (visits >= MAX_VISITS) return;
			let entries = [];
			try {
				entries = await fs.promises.readdir(current, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of entries) {
				if (visits >= MAX_VISITS) return;
				visits += 1;
				if (entry.name === ".git" || !entry.isDirectory()) continue;
				const abs = path.join(current, entry.name);
				if (!await hasGitEntry(abs)) {
					await walk(abs);
					continue;
				}
				const result = await spawnGit(abs, ["rev-parse", "--absolute-git-dir"], this.baseEnv, this.options.spawnTimeoutMs).catch(() => void 0);
				if (result === void 0 || result.code !== 0) continue;
				const info = {
					root: abs,
					gitDir: path.resolve(abs, result.stdout.trim()),
					rel: path.relative(dir, abs).split(path.sep).join("/")
				};
				if (accept !== void 0 && !await accept(info)) continue;
				await walk(abs);
				found.push(info);
			}
		};
		try {
			await walk(dir);
		} catch {}
		return found;
	}
	/** Workspace-relative gitlink paths stored in a tree snapshot. */
	async gitlinkPaths(tree) {
		if (!isHash(tree)) return [];
		const listing = await this.run([
			"ls-tree",
			"-r",
			"-z",
			tree
		]).catch(() => void 0);
		if (listing === void 0 || listing.code !== 0) return [];
		const paths = [];
		for (const record of listing.stdout.split("\0")) {
			if (record === "") continue;
			const parts = record.split("	");
			const meta = parts[0] ?? "";
			const filePath = parts[1];
			if (filePath !== void 0 && meta.split(" ")[0] === "160000") paths.push(filePath);
		}
		return paths;
	}
	/** Capture one worktree (the workspace root or a nested repository root). */
	async captureWorktree(cwd, signal, reuseIndex) {
		const ownsIndex = reuseIndex === void 0;
		const index = reuseIndex ?? await this.createTempIndex();
		let nested = [];
		try {
			if (ownsIndex) {
				const reset = await this.runAt(cwd, ["read-tree", "--empty"], signal, index);
				if (reset.code !== 0) throw new Error(`git read-tree --empty failed: ${reset.stderr.trim()}`);
			}
			let added = await this.runAt(cwd, ["add", "-A"], signal, index);
			if (added.code !== 0) {
				const excludes = [];
				const scanned = await this.scanNestedRepos(cwd).catch(() => []);
				nested = scanned.map((repo) => repo.rel).filter((rel) => rel !== "");
				for (const repo of scanned) if (!await this.hasHead(repo.root)) excludes.push(`:(exclude)${repo.rel}/`);
				if (excludes.length > 0) added = await this.runAt(cwd, [
					"add",
					"-A",
					"--",
					...excludes
				], signal, index);
			}
			if (added.code !== 0) throw new Error(`git add -A failed: ${added.stderr.trim()}`);
			const result = await this.runAt(cwd, ["write-tree"], signal, index);
			if (result.code !== 0) throw new Error(`git write-tree failed: ${result.stderr.trim()}`);
			const tree = result.stdout.trim();
			if (!isHash(tree)) throw new Error(`git write-tree returned invalid tree hash: ${tree}`);
			return {
				tree,
				nested
			};
		} finally {
			if (ownsIndex) {
				fs.rmSync(index, { force: true });
				fs.rmSync(path.dirname(index), {
					recursive: true,
					force: true
				});
			}
		}
	}
	/** Whether a repository has a resolvable HEAD (false ⇒ commitless/bare). */
	async hasHead(root) {
		const result = await spawnGit(root, [
			"rev-parse",
			"--verify",
			"-q",
			"HEAD"
		], this.baseEnv, this.options.spawnTimeoutMs).catch(() => void 0);
		return result !== void 0 && result.code === 0;
	}
	/** Replace gitlink records by directory trees (materialization) via a throwaway index. */
	async replaceGitlinks(tree, entries, signal) {
		if (entries.length === 0) return tree;
		const index = await this.createTempIndex();
		try {
			if ((await this.run(["read-tree", "--empty"], signal, index)).code !== 0) return tree;
			if ((await this.run(["read-tree", tree], signal, index)).code !== 0) return tree;
			for (const entry of entries) {
				await this.run([
					"update-index",
					"--force-remove",
					"--",
					entry.path
				], signal, index);
				if ((await this.run([
					"read-tree",
					"--prefix",
					`${entry.path}/`,
					entry.tree
				], signal, index)).code !== 0) return tree;
			}
			const written = await this.run(["write-tree"], signal, index);
			if (written.code !== 0) return tree;
			const out = written.stdout.trim();
			return isHash(out) ? out : tree;
		} finally {
			fs.rmSync(index, { force: true });
			fs.rmSync(path.dirname(index), {
				recursive: true,
				force: true
			});
		}
	}
	/** Run git against the isolated repo from an arbitrary worktree. */
	async runAt(cwd, args, signal, indexFile) {
		if (!await this.ensureIsolated(signal)) return {
			code: 128,
			stdout: "",
			stderr: "rollback: isolated snapshot repository is unavailable"
		};
		return spawnGit(cwd, args, indexFile === void 0 ? this.baseEnv : {
			...this.baseEnv,
			GIT_INDEX_FILE: indexFile
		}, this.options.spawnTimeoutMs, signal, this.options.isolatedRepoDir, cwd);
	}
	async treeExists(tree, signal) {
		if (!isHash(tree)) return false;
		return (await this.run([
			"cat-file",
			"-e",
			`${tree}^{tree}`
		], signal)).code === 0;
	}
	async diffEntries(from, to, signal) {
		if (!isHash(from) || !isHash(to)) throw new Error("diff-trees requires valid tree hashes");
		const result = await this.run([
			"diff-tree",
			"-r",
			"--no-renames",
			"-z",
			from,
			to
		], signal);
		if (result.code !== 0) throw new Error(`git diff-tree failed: ${result.stderr.trim()}`);
		return parseDiffTreeZ(result.stdout);
	}
	async diffHunks(from, to, filePath, signal) {
		this.assertSafeRelPath(filePath);
		const result = await this.run([
			"diff-tree",
			"-p",
			"-U3",
			"--no-renames",
			from,
			to,
			"--",
			filePath
		], signal);
		if (result.code !== 0) throw new Error(`git diff-tree -p failed: ${result.stderr.trim()}`);
		return parseDiffHunks(result.stdout, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile);
	}
	/**
	* Diff hunks for many paths in a single git process. `paths` must be
	* sorted; sections come back in the same order (git tree traversal is
	* lexicographic). Returns a map missing entries for any path whose section
	* is absent or out of order — the caller then falls back to per-file diffs.
	*/
	async diffHunksBatched(from, to, paths, signal) {
		if (paths.length === 0) return /* @__PURE__ */ new Map();
		for (const rel of paths) this.assertSafeRelPath(rel);
		const result = await this.run([
			"diff-tree",
			"-p",
			"-U3",
			"--no-renames",
			from,
			to,
			"--",
			...paths
		], signal);
		if (result.code !== 0) throw new Error(`git diff-tree -p failed: ${result.stderr.trim()}`);
		return splitDiffByPath(result.stdout, paths, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile);
	}
	async pathsInTree(tree, relPath, signal) {
		if (!isHash(tree)) throw new Error("ls-tree requires a valid tree hash");
		const args = [
			"ls-tree",
			"-r",
			"--name-only",
			"-z",
			tree
		];
		if (relPath !== void 0 && relPath !== "") {
			this.assertSafeRelPath(relPath);
			args.push("--", relPath);
		}
		const result = await this.run(args, signal);
		if (result.code !== 0) return [];
		return result.stdout.split("\0").filter(Boolean);
	}
	async blobHash(tree, relPath, signal) {
		this.assertSafeRelPath(relPath);
		const result = await this.run([
			"rev-parse",
			"--verify",
			`${tree}:${relPath}`
		], signal);
		if (result.code !== 0) return void 0;
		const hash = result.stdout.trim();
		return isHash(hash) ? hash : void 0;
	}
	/**
	* Every blob in a tree-ish as `path → blob hash` (one `ls-tree` process).
	* Reads `refs/dsh/pre`, the session-start contents `git add -A` refused to
	* index (ignored paths).
	*/
	async treeBlobs(treeish, signal) {
		const result = await this.run([
			"ls-tree",
			"-r",
			"-z",
			treeish
		], signal);
		if (result.code !== 0) return /* @__PURE__ */ new Map();
		const entries = /* @__PURE__ */ new Map();
		for (const record of result.stdout.split("\0")) {
			if (record === "") continue;
			const tab = record.indexOf("	");
			if (tab < 0) continue;
			const meta = record.slice(0, tab).split(" ");
			if (meta[1] !== "blob") continue;
			const blob = meta[2];
			if (blob !== void 0 && isHash(blob)) entries.set(record.slice(tab + 1), blob);
		}
		return entries;
	}
	/**
	* Resolve many `<treeish>:<path>` lookups in **one** process
	* (`cat-file --batch-check`), positionally. `undefined` means the spec does
	* not resolve (absent path, unresolvable treeish, or git unavailable).
	*
	* This is the batch form of `blobHash` and the reason the accept/list hot
	* paths no longer spawn one `rev-parse` per changed file: on a 35-file list
	* the per-path form costs ~0.5 s, this one ~20 ms. Specs whose path cannot
	* ride the line protocol (a newline in the name) fall back to `blobHash`,
	* as does the whole batch when the process fails.
	*/
	async blobHashes(specs, signal) {
		const result = new Array(specs.length);
		const resolved = new Array(specs.length).fill(false);
		const batchable = [];
		for (let index = 0; index < specs.length; index += 1) {
			const spec = specs[index];
			this.assertSafeRelPath(spec.path);
			if (!spec.path.includes("\n") && !spec.path.includes("\r")) batchable.push(index);
		}
		if (batchable.length > 0) {
			const run = await this.run(["cat-file", "--batch-check=%(objectname)"], signal, void 0, void 0, `${batchable.map((index) => `${specs[index].treeish}:${specs[index].path}`).join("\n")}\n`);
			if (run.code === 0) {
				const lines = run.stdout.split("\n");
				let complete = true;
				for (let at = 0; at < batchable.length; at += 1) {
					const line = (lines[at] ?? "").trim();
					if (isHash(line)) {
						result[batchable[at]] = line;
						resolved[batchable[at]] = true;
					} else if (line.endsWith(" missing")) resolved[batchable[at]] = true;
					else complete = false;
				}
				if (!complete) for (const index of batchable) {
					result[index] = void 0;
					resolved[index] = false;
				}
			}
		}
		for (let index = 0; index < specs.length; index += 1) {
			if (resolved[index] === true) continue;
			const spec = specs[index];
			result[index] = await this.blobHash(spec.treeish, spec.path, signal).catch(() => void 0);
		}
		return result;
	}
	async fileHash(relPath, signal) {
		this.assertSafeRelPath(relPath);
		if (!fs.existsSync(path.resolve(this.cwd, relPath))) return void 0;
		const result = await this.run([
			"hash-object",
			"--",
			relPath
		], signal);
		if (result.code !== 0) return void 0;
		const hash = result.stdout.trim();
		return isHash(hash) ? hash : void 0;
	}
	/**
	* Hash many worktree files in **one** process
	* (`hash-object [-w] --stdin-paths`), keyed by workspace-relative path.
	* Absent paths map to `undefined`, exactly like `fileHash` / `writeBlob`;
	* with `write` the blobs are also stored in the object store.
	*
	* `hash-object --stdin-paths` dies on the first missing file, so absent
	* paths are filtered with a stat before the call and the batch falls back to
	* per-path spawns when the process fails (or for a path that cannot ride the
	* line protocol).
	*/
	async hashBlobs(relPaths, options = {}) {
		const unique = [...new Set(relPaths)];
		const result = /* @__PURE__ */ new Map();
		const batchable = [];
		for (const rel of unique) {
			this.assertSafeRelPath(rel);
			result.set(rel, void 0);
			if (rel.includes("\n") || rel.includes("\r")) continue;
			try {
				if (fs.statSync(path.resolve(this.cwd, rel)).isFile()) batchable.push(rel);
			} catch {}
		}
		const resolved = /* @__PURE__ */ new Set();
		if (batchable.length > 0) {
			const run = await this.run([
				"hash-object",
				...options.write === true ? ["-w"] : [],
				"--stdin-paths"
			], options.signal, void 0, void 0, `${batchable.join("\n")}\n`);
			if (run.code === 0) {
				const lines = run.stdout.split("\n");
				let complete = true;
				for (let index = 0; index < batchable.length; index += 1) {
					const hash = (lines[index] ?? "").trim();
					if (isHash(hash)) {
						result.set(batchable[index], hash);
						resolved.add(batchable[index]);
					} else complete = false;
				}
				if (!complete) for (const rel of batchable) result.set(rel, void 0);
			}
		}
		for (const rel of unique) {
			if (resolved.has(rel)) continue;
			const hash = options.write === true ? await this.writeBlob(this.absolutePath(rel), options.signal).catch(() => void 0) : await this.fileHash(rel, options.signal).catch(() => void 0);
			result.set(rel, hash);
		}
		return result;
	}
	/**
	* Run `body` with a **private** throwaway index.
	*
	* Scratch work (accept, hunk/patch application, guard capture, list diffs)
	* must never share an index file: two overlapping operations would
	* interleave `read-tree` / `apply --cached` / `write-tree` and could publish
	* a corrupted tree. `update-ref`'s compare-and-swap protects the ref, not the
	* tree, so isolation has to happen here.
	*/
	async withScratch(body) {
		const index = await this.createTempIndex();
		try {
			return await body(index);
		} finally {
			fs.rmSync(index, { force: true });
			fs.rmSync(path.dirname(index), {
				recursive: true,
				force: true
			});
		}
	}
	/**
	* A persistent index file inside the isolated repo. `scan` backs the
	* full-worktree `add -A` (its stat cache must survive between captures).
	* Use `withScratch` for every other index need.
	*/
	indexPath(kind) {
		const dir = this.options.isolatedRepoDir;
		if (dir === void 0 || dir === "") return void 0;
		return path.join(dir, kind === "scan" ? "dsh-scan.index" : "dsh-scratch.index");
	}
	/**
	* Write a worktree file into the isolated object store and return its blob
	* hash. `undefined` when the path is absent or unreadable, which the caller
	* records as a deletion.
	*/
	async writeBlob(absPath, signal) {
		if (!path.isAbsolute(absPath) || absPath.includes("\0")) return void 0;
		try {
			if (!fs.statSync(absPath).isFile()) return void 0;
		} catch {
			return;
		}
		const result = await this.run([
			"hash-object",
			"-w",
			"--",
			absPath
		], signal);
		if (result.code !== 0) return void 0;
		const hash = result.stdout.trim();
		return isHash(hash) ? hash : void 0;
	}
	/** `write-tree` from an explicit index file. */
	async writeTree(indexFile, signal) {
		const result = await this.run(["write-tree"], signal, indexFile);
		if (result.code !== 0) throw new Error(`git write-tree failed: ${result.stderr.trim()}`);
		const tree = result.stdout.trim();
		if (!isHash(tree)) throw new Error(`git write-tree returned invalid tree hash: ${tree}`);
		return tree;
	}
	/** Reset an index file to a tree-ish (`read-tree`; `--empty` when omitted). */
	async readTree(indexFile, treeish, signal) {
		const args = treeish === void 0 || treeish === "" ? ["read-tree", "--empty"] : ["read-tree", treeish];
		const result = await this.run(args, signal, indexFile);
		if (result.code !== 0) throw new Error(`git read-tree failed: ${result.stderr.trim()}`);
	}
	/**
	* Register many index entries in a single git process (`update-index
	* --index-info`). An entry without `blob` removes the path.
	*/
	async updateIndexInfo(indexFile, entries, signal) {
		if (entries.length === 0) return;
		if (entries.every((entry) => !/[\n\t]/.test(entry.path))) {
			const lines = entries.map((entry) => entry.blob === void 0 ? `0 ${ZERO_SHA}\t${entry.path}\n` : `${entry.mode ?? "100644"} ${entry.blob}\t${entry.path}\n`).join("");
			const result = await this.run(["update-index", "--index-info"], signal, indexFile, void 0, lines);
			if (result.code !== 0) throw new Error(`git update-index --index-info failed: ${result.stderr.trim()}`);
			return;
		}
		for (const entry of entries) {
			const args = entry.blob === void 0 ? [
				"update-index",
				"--force-remove",
				"--",
				entry.path
			] : [
				"update-index",
				"--add",
				"--cacheinfo",
				`${entry.mode ?? "100644"},${entry.blob},${entry.path}`
			];
			const result = await this.run(args, signal, indexFile);
			if (result.code !== 0) throw new Error(`git update-index failed for ${entry.path}: ${result.stderr.trim()}`);
		}
	}
	/**
	* Apply a patch to an index only (never the worktree). The caller follows
	* with `checkoutIndex` to materialize the result. This is the forward-only
	* primitive behind hunk undo and patch replay.
	*/
	async applyCached(indexFile, patch, options = {}, signal) {
		if (patch.trim() === "") return {
			ok: true,
			stderr: ""
		};
		const args = [
			"apply",
			"--cached",
			"--whitespace=nowarn"
		];
		if (options.unidiffZero === true) args.push("--unidiff-zero");
		if (options.threeWay === true) args.push("--3way");
		const result = await this.run(args, signal, indexFile, void 0, patch);
		return {
			ok: result.code === 0,
			stderr: result.stderr.trim()
		};
	}
	/**
	* Stage specific worktree paths into an index, including ignored ones
	* (`-f`). A tree-vs-worktree diff only sees paths present in the index, so
	* files created after the baseline (and ignored files) must be staged before
	* the diff, which is also what keeps the diff bounded to session paths.
	*/
	async stagePaths(indexFile, relPaths, signal) {
		const existing = [];
		for (const rel of new Set(relPaths)) {
			this.assertSafeRelPath(rel);
			try {
				if (fs.statSync(path.resolve(this.cwd, rel)).isFile()) existing.push(rel);
			} catch {}
		}
		if (existing.length === 0) return;
		const chunkSize = Math.max(1, this.options.restoreChunkSize);
		for (let start = 0; start < existing.length; start += chunkSize) {
			const chunk = existing.slice(start, start + chunkSize);
			const result = await this.run([
				"add",
				"-f",
				"--",
				...chunk
			], signal, indexFile);
			if (result.code !== 0) throw new Error(`git add -f failed for ${chunk.join(", ")}: ${result.stderr.trim()}`);
		}
	}
	/**
	* Stage worktree paths from their **content** (`hash-object -w` +
	* `update-index --index-info`) instead of `git add -f`.
	*
	* `git add -f` records no index entry for a path inside an embedded git
	* repository that has no resolvable HEAD (it exits 0 and writes nothing), so a
	* file this session *created* in such a directory would be missing from every
	* tree-vs-worktree diff — untracked paths never appear in `git diff <tree>`.
	* Feeding the blob hash to the index is content-addressed, never asks git to
	* index the embedded worktree, and covers created, modified and ignored files
	* alike.
	*/
	async stagePathsByContent(indexFile, relPaths, signal) {
		const unique = [...new Set(relPaths)];
		if (unique.length === 0) return;
		const existing = [];
		for (const rel of unique) {
			this.assertSafeRelPath(rel);
			try {
				if (fs.statSync(path.resolve(this.cwd, rel)).isFile()) existing.push(rel);
			} catch {}
		}
		if (existing.length === 0) return;
		const blobs = await this.hashBlobs(existing, {
			write: true,
			...signal === void 0 ? {} : { signal }
		});
		const entries = [];
		for (const rel of existing) {
			const blob = blobs.get(rel);
			if (blob !== void 0) entries.push({
				path: rel,
				blob
			});
		}
		await this.updateIndexInfo(indexFile, entries, signal);
	}
	/** Write index entries from an index file into the worktree. */
	async checkoutIndex(indexFile, relPaths, signal) {
		const unique = [...new Set(relPaths.map((item) => this.normalizeRelPath(item)))];
		if (unique.length === 0) return;
		const chunkSize = Math.max(1, this.options.restoreChunkSize);
		for (let start = 0; start < unique.length; start += chunkSize) {
			const chunk = unique.slice(start, start + chunkSize);
			const result = await this.run([
				"checkout-index",
				"-f",
				"--",
				...chunk
			], signal, indexFile);
			if (result.code !== 0) throw new Error(`git checkout-index failed for ${chunk.join(", ")}: ${result.stderr.trim()}`);
		}
	}
	/**
	* The raw patch between two tree-ish values, or between a tree-ish and the
	* worktree when `to` is omitted. Output keeps its `diff --git` headers so it
	* can be fed straight back to `applyCached`. For the worktree form
	* `indexFile` must be populated from `from` (see `readTree`), otherwise git
	* reports every path as deleted.
	*/
	async diffPatch(from, to, relPaths, options = {}) {
		for (const rel of relPaths) this.assertSafeRelPath(rel);
		const args = [
			"diff",
			"--no-renames",
			"--full-index",
			`--unified=${Math.max(0, options.context ?? 3)}`,
			from
		];
		if (to !== void 0 && to !== "") args.push(to);
		if (relPaths.length > 0) args.push("--", ...relPaths);
		const result = await this.run(args, options.signal, options.indexFile);
		if (result.code !== 0) throw new Error(`git diff failed: ${result.stderr.trim()}`);
		return result.stdout;
	}
	/**
	* Per-commit patches for many commits in one process: each commit hash on
	* stdin produces its own diff against its first parent, prefixed by a line
	* containing the commit hash. This is the batched form of the per-call patch
	* list (docs/git-only-plan.md §3).
	*/
	async diffTreePatches(commits, options = {}) {
		const result = /* @__PURE__ */ new Map();
		const hashes = commits.filter((commit) => isHash(commit));
		if (hashes.length === 0) return result;
		const run = await this.run([
			"diff-tree",
			"-p",
			"--no-renames",
			"--full-index",
			`--unified=${Math.max(0, options.context ?? 3)}`,
			"--stdin"
		], options.signal, void 0, void 0, `${hashes.join("\n")}\n`);
		if (run.code !== 0) throw new Error(`git diff-tree --stdin failed: ${run.stderr.trim()}`);
		let current;
		let lines = [];
		const flush = () => {
			if (current !== void 0) result.set(current, lines.join("\n"));
			lines = [];
		};
		for (const line of run.stdout.split("\n")) {
			if (isHash(line)) {
				flush();
				current = line;
				continue;
			}
			if (current !== void 0) lines.push(line);
		}
		flush();
		return result;
	}
	/** Create a commit object for a tree (no worktree or index involved). */ async commitTree(tree, parents, message, options = {}, signal) {
		if (!isHash(tree)) throw new Error("commit-tree requires a valid tree hash");
		if (!await this.ensureIsolated(signal)) throw new Error("rollback: isolated snapshot repository is unavailable");
		const when = Math.floor((options.timestamp ?? Date.now()) / 1e3);
		const env = {
			...this.baseEnv,
			GIT_AUTHOR_NAME: "dsh",
			GIT_AUTHOR_EMAIL: "dsh@local",
			GIT_COMMITTER_NAME: "dsh",
			GIT_COMMITTER_EMAIL: "dsh@local",
			GIT_AUTHOR_DATE: `${when} +0000`,
			GIT_COMMITTER_DATE: `${when} +0000`
		};
		const args = ["commit-tree", tree];
		for (const parent of parents) if (isHash(parent)) args.push("-p", parent);
		const result = await spawnGit(this.cwd, args, env, this.options.spawnTimeoutMs, signal, this.options.isolatedRepoDir, void 0, message);
		if (result.code !== 0) throw new Error(`git commit-tree failed: ${result.stderr.trim()}`);
		const commit = result.stdout.trim();
		if (!isHash(commit)) throw new Error(`git commit-tree returned invalid hash: ${commit}`);
		return commit;
	}
	/** Resolve a ref to its object hash, or undefined when it does not exist. */
	async readRef(ref, signal) {
		const result = await this.run([
			"rev-parse",
			"--verify",
			"--quiet",
			ref
		], signal);
		if (result.code !== 0) return void 0;
		const hash = result.stdout.trim();
		return isHash(hash) ? hash : void 0;
	}
	/**
	* Move a ref. With `expectedOld` this is a compare-and-swap: the update
	* fails (returns false) unless the ref currently points at `expectedOld`,
	* which makes concurrent accepts safe without a lock.
	*/
	async updateRef(ref, sha, expectedOld, signal) {
		if (!isHash(sha)) throw new Error("update-ref requires a valid object hash");
		const args = [
			"update-ref",
			ref,
			sha
		];
		if (expectedOld !== void 0) args.push(expectedOld);
		return (await this.run(args, signal)).code === 0;
	}
	/** Refs under a prefix, in refname order. */
	async listRefs(prefix, signal) {
		const result = await this.run([
			"for-each-ref",
			"--format=%(refname)%00%(objectname)",
			prefix
		], signal);
		if (result.code !== 0) return [];
		const out = [];
		for (const line of result.stdout.split("\n")) {
			if (line === "") continue;
			const [ref, sha] = line.split("\0");
			if (ref === void 0 || sha === void 0 || !isHash(sha)) continue;
			out.push({
				ref,
				sha
			});
		}
		return out;
	}
	/**
	* Refs under a prefix with their commit messages in the same process
	* (`for-each-ref --format=…%(contents)`), used by the ref-backed journal.
	*/
	async listRefsDetailed(prefix, signal) {
		const result = await this.run([
			"for-each-ref",
			"--format=%(refname)%00%(objectname)%00%(contents)",
			prefix
		], signal);
		if (result.code !== 0) return [];
		const out = [];
		for (const line of result.stdout.split("\n")) {
			if (line === "") continue;
			const parts = line.split("\0");
			const ref = parts[0];
			const sha = parts[1];
			if (ref === void 0 || sha === void 0 || !isHash(sha)) continue;
			out.push({
				ref,
				sha,
				contents: parts.slice(2).join("\0")
			});
		}
		return out;
	}
	/**
	* Refs under a prefix with commit metadata in one process: refname, object
	* hash, tree hash, committer time and message. Backs the turn-point list.
	*/
	async listRefsWithMeta(prefix, signal) {
		const result = await this.run([
			"for-each-ref",
			"--format=%(refname)%00%(objectname)%00%(tree)%00%(creatordate:unix)%00%(contents)",
			prefix
		], signal);
		if (result.code !== 0) return [];
		const out = [];
		for (const line of result.stdout.split("\n")) {
			if (line === "") continue;
			const parts = line.split("\0");
			const ref = parts[0];
			const sha = parts[1];
			if (ref === void 0 || sha === void 0 || !isHash(sha)) continue;
			out.push({
				ref,
				sha,
				tree: (parts[2] ?? "").trim(),
				createdAt: Number(parts[3] ?? "0") || 0,
				contents: parts.slice(4).join("\0")
			});
		}
		return out;
	}
	/**
	* Parentless ancestors of a revision (`git rev-list --max-parents=0`), i.e.
	* the root commit(s) of its history. Used to recover the session chain base
	* of chains created before `refs/dsh/base` existed.
	*/
	async roots(rev, signal) {
		if (!isHash(rev)) return [];
		const result = await this.run([
			"rev-list",
			"--max-parents=0",
			rev
		], signal);
		if (result.code !== 0) return [];
		return result.stdout.split("\n").map((line) => line.trim()).filter(isHash);
	}
	/** The tree hash a revision points at (`rev-parse <rev>^{tree}`). */
	async treeOf(rev, signal) {
		const result = await this.run([
			"rev-parse",
			"--verify",
			`${rev}^{tree}`
		], signal);
		const tree = result.stdout.trim();
		if (result.code !== 0 || !isHash(tree)) throw new Error(`git rev-parse ${rev}^{tree} failed: ${result.stderr.trim()}`);
		return tree;
	}
	/** Delete a ref (best-effort; missing refs are not an error). */
	async deleteRefs(refs, signal) {
		if (refs.length === 0) return;
		await this.run(["update-ref", "--stdin"], signal, void 0, void 0, refs.map((ref) => `delete ${ref}\n`).join(""));
	}
	/**
	* Build any number of commits in one process. The caller assembles the
	* fast-import stream; blobs must already exist in the isolated repo (see
	* `writeBlob`), so this is the freeze step of the per-call chain.
	*/
	async fastImport(stream, signal) {
		if (stream.trim() === "") return;
		if (!await this.ensureIsolated(signal)) throw new Error("rollback: isolated snapshot repository is unavailable");
		const payload = stream.endsWith("\n") ? stream : `${stream}\n`;
		const result = await spawnGit(this.cwd, ["fast-import", "--quiet"], this.baseEnv, this.options.spawnTimeoutMs, signal, this.options.isolatedRepoDir, void 0, payload);
		if (result.code !== 0) throw new Error(`git fast-import failed: ${result.stderr.trim()}`);
	}
	async restorePaths(tree, relPaths, signal) {
		if (!isHash(tree)) throw new Error("restore requires a valid tree hash");
		const unique = [...new Set(relPaths.map((item) => this.normalizeRelPath(item)))];
		if (unique.length === 0) return;
		const index = await this.createTempIndex();
		try {
			const reset = await this.run(["read-tree", "--empty"], signal, index);
			if (reset.code !== 0) throw new Error(`git read-tree --empty failed: ${reset.stderr.trim()}`);
			const populated = await this.run(["read-tree", tree], signal, index);
			if (populated.code !== 0) throw new Error(`git read-tree ${tree} failed: ${populated.stderr.trim()}`);
			const chunkSize = Math.max(1, this.options.restoreChunkSize);
			for (let start = 0; start < unique.length; start += chunkSize) {
				const chunk = unique.slice(start, start + chunkSize);
				const result = await this.run([
					"restore",
					"--worktree",
					`--source=${tree}`,
					"--",
					...chunk
				], signal, index);
				if (result.code !== 0) throw new Error(`git restore failed for ${chunk.join(", ")}: ${result.stderr.trim()}`);
			}
		} finally {
			fs.rmSync(index, { force: true });
			fs.rmSync(path.dirname(index), {
				recursive: true,
				force: true
			});
		}
	}
	async assertNoGitOperation(signal) {
		const dir = await this.resolveProjectGitDir(signal);
		if (dir === void 0) return false;
		for (const marker of RUNNING_OPS) if (fs.existsSync(path.join(dir, marker))) return true;
		for (const sub of ["rebase-merge", "rebase-apply"]) if (fs.existsSync(path.join(dir, sub))) return true;
		return false;
	}
	/** Every snapshot object operation runs against the isolated repo. */
	async run(args, signal, indexFile, _unused, input) {
		if (!await this.ensureIsolated(signal)) return {
			code: 128,
			stdout: "",
			stderr: "rollback: isolated snapshot repository is unavailable"
		};
		const env = indexFile === void 0 ? this.baseEnv : {
			...this.baseEnv,
			GIT_INDEX_FILE: indexFile
		};
		return spawnGit(this.cwd, args, env, this.options.spawnTimeoutMs, signal, this.options.isolatedRepoDir, this.cwd, input);
	}
	/** Read-only queries against the project's own repo (head, fences). */
	async runProject(args, signal) {
		return spawnGit(this.cwd, args, this.baseEnv, this.options.spawnTimeoutMs, signal);
	}
	/** The project's git dir (`.git`), or undefined outside a git worktree. */
	async resolveProjectGitDir(signal) {
		if (this.projectGitDir != null) return this.projectGitDir;
		this.projectGitDir = null;
		const result = await this.runProject(["rev-parse", "--absolute-git-dir"], signal);
		if (result.code === 0) {
			const out = result.stdout.trim();
			if (out !== "" && out !== ".") this.projectGitDir = path.resolve(this.cwd, out);
		}
		return this.projectGitDir ?? void 0;
	}
	normalizeRelPath(input) {
		this.assertSafeRelPath(input);
		const abs = path.resolve(this.cwd, input);
		return path.relative(this.cwd, abs).split(path.sep).join("/");
	}
	isWithin(input) {
		try {
			this.assertSafeRelPath(input);
			return true;
		} catch {
			return false;
		}
	}
	assertSafeRelPath(input) {
		if (typeof input !== "string" || input.length === 0) throw new Error("path must be a non-empty string");
		if (input.includes("\0")) throw new Error("path must not contain NUL");
		if (path.isAbsolute(input)) throw new Error(`path must be relative to the workspace: ${input}`);
		const abs = path.resolve(this.cwd, input);
		const rel = path.relative(this.cwd, abs);
		if (rel === ".." || rel.startsWith(`..${path.sep}`)) throw new Error(`path escapes the workspace: ${input}`);
	}
	absolutePath(relPath) {
		return path.resolve(this.cwd, this.normalizeRelPath(relPath));
	}
	async createTempIndex() {
		const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dsh-rollback-index-"));
		return path.join(dir, "index");
	}
};
function parseDiffTreeZ(stdout) {
	const parts = stdout.split("\0");
	const entries = [];
	for (let i = 0; i + 1 < parts.length; i += 2) {
		const meta = parts[i] ?? "";
		const file = parts[i + 1] ?? "";
		if (file === "") continue;
		const status = meta.slice(-1);
		if (status !== "A" && status !== "M" && status !== "D" && status !== "T") continue;
		const fields = meta.slice(1).split(" ");
		entries.push({
			path: file,
			status,
			oldMode: fields[0] ?? "",
			newMode: fields[1] ?? "",
			oldHash: fields[2] ?? "",
			newHash: fields[3] ?? ""
		});
	}
	return entries;
}
function parseDiffHunks(stdout, maxHunks, maxBytes) {
	if (stdout.includes("Binary files ") && stdout.includes(" differ")) return {
		hunks: [],
		truncated: false,
		binary: true
	};
	const lines = stdout.split(/\r?\n/);
	const hunks = [];
	let truncated = false;
	let bytes = 0;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? "";
		if (!line.startsWith("@@ ")) continue;
		const parsed = parseHunkHeader(line);
		if (parsed === void 0) continue;
		const oldLines = [];
		const newLines = [];
		let firstOld;
		let firstNew;
		let oldBefore = 0;
		let newBefore = 0;
		for (i += 1; i < lines.length; i += 1) {
			const body = lines[i] ?? "";
			if (body === "\\ No newline at end of file") continue;
			if (body.startsWith("@@ ")) {
				i -= 1;
				break;
			}
			if (body.startsWith("--- ") || body.startsWith("+++ ")) continue;
			if (body.startsWith(" ")) {
				const text = body.slice(1);
				oldLines.push(text);
				newLines.push(text);
				oldBefore += 1;
				newBefore += 1;
			} else if (body.startsWith("-")) {
				if (firstOld === void 0) firstOld = oldBefore;
				if (firstNew === void 0) firstNew = newBefore;
				oldLines.push(body.slice(1));
				oldBefore += 1;
			} else if (body.startsWith("+")) {
				if (firstNew === void 0) firstNew = newBefore;
				if (firstOld === void 0) firstOld = oldBefore;
				newLines.push(body.slice(1));
				newBefore += 1;
			}
		}
		const oldText = oldLines.join("\n");
		const newText = newLines.join("\n");
		bytes += Buffer.byteLength(newText, "utf8");
		if (hunks.length >= maxHunks || bytes > maxBytes) {
			truncated = true;
			break;
		}
		hunks.push({
			oldText,
			newText,
			...parsed.oldLine === void 0 ? {} : { oldLine: parsed.oldLine },
			...parsed.newLine === void 0 ? {} : { newLine: parsed.newLine },
			...parsed.endLine === void 0 ? {} : { endLine: parsed.endLine },
			...firstOld === void 0 || parsed.oldLine === void 0 ? {} : { firstChangedOldLine: parsed.oldLine + firstOld },
			...firstNew === void 0 || parsed.newLine === void 0 ? {} : { firstChangedNewLine: parsed.newLine + firstNew }
		});
	}
	return {
		hunks,
		truncated,
		binary: false
	};
}
function parseHunkHeader(line) {
	const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
	if (match === null) return void 0;
	const newLine = Number(match[3]);
	const newCount = match[4] === void 0 ? 1 : Number(match[4]);
	const oldLine = Number(match[1]);
	if (newCount > 0) return {
		oldLine,
		newLine,
		endLine: newLine + newCount - 1
	};
	return {
		oldLine,
		newLine
	};
}
/** Split a multi-file `git diff-tree -p` stream into per-file sections. */
function splitDiffSections(stdout) {
	const lines = stdout.split("\n");
	const sections = [];
	let current = [];
	for (const line of lines) if (line.startsWith("diff --git ")) {
		if (current.length > 0) {
			sections.push(current.join("\n"));
			current = [];
		}
		current.push(line);
	} else if (current.length > 0) current.push(line);
	if (current.length > 0) sections.push(current.join("\n"));
	return sections;
}
/** Parse the path out of a `diff --git a/x b/x` section header (quoted or not). */
function diffGitPath(line) {
	const rest = line.slice(11);
	if (!rest.startsWith("\"")) {
		const match = /^a\/(\S+) b\//.exec(rest);
		return match === null ? void 0 : match[1];
	}
	const match = /^"a\/((?:[^"\\]|\\.)*)" "b\//.exec(rest);
	return match === null ? void 0 : unquoteGitPath(match[1] ?? "");
}
/** Undo git's C-style path quoting (core.quotePath). */
function unquoteGitPath(quoted) {
	let out = "";
	for (let i = 0; i < quoted.length; i += 1) {
		const ch = quoted[i];
		if (ch !== "\\") {
			out += ch;
			continue;
		}
		const next = quoted[i + 1];
		if (next === void 0) break;
		if (next === "n") out += "\n";
		else if (next === "t") out += "	";
		else if (next === "r") out += "\r";
		else if (next === "a") out += "a";
		else if (next === "b") out += "\b";
		else if (next === "f") out += "\f";
		else if (next === "v") out += "\v";
		else if (next === "\"") out += "\"";
		else if (next === "\\") out += "\\";
		else if (next >= "0" && next <= "7") {
			let octal = next;
			let j = i + 2;
			while (octal.length < 3 && j < quoted.length && quoted[j] >= "0" && quoted[j] <= "7") {
				octal += quoted[j];
				j += 1;
			}
			out += String.fromCharCode(parseInt(octal, 8));
			i = j - 1;
		} else out += next;
		i += 1;
	}
	return out;
}
/**
* Map a batched diff stream to per-path parse results. `sortedPaths` must be
* sorted like the stream; a section count or order mismatch returns a map
* missing the affected entries so the caller can fall back per file.
*/
function splitDiffByPath(stdout, sortedPaths, maxHunks, maxBytes) {
	const result = /* @__PURE__ */ new Map();
	const sections = splitDiffSections(stdout);
	if (sections.length !== sortedPaths.length) return result;
	for (let i = 0; i < sections.length; i += 1) {
		const expected = sortedPaths[i];
		const parsedPath = diffGitPath(sections[i].split("\n")[0] ?? "");
		if (parsedPath !== void 0 && parsedPath !== expected) return result;
		result.set(expected, parseDiffHunks(sections[i], maxHunks, maxBytes));
	}
	return result;
}
function buildFileChange(cwd, entry, hunks, truncated, binary) {
	const status = entry.status === "A" ? "created" : entry.status === "D" ? "deleted" : entry.status === "T" ? "typechange" : binary ? "binary" : "modified";
	const nested = entry.newMode === "160000" || entry.oldMode === "160000";
	return {
		path: entry.path,
		absolutePath: path.resolve(cwd, entry.path),
		status: nested ? "nested-repo" : status,
		source: "git",
		restorable: entry.status !== "A" && !nested,
		...entry.status === "A" ? { createdAfterSnapshot: true } : {},
		...binary ? { binary: true } : {},
		...truncated ? { truncated: true } : {},
		...hunks.length > 0 ? { hunks } : {}
	};
}
//#endregion
//#region lib/types/host/hunk-undo.js
/** Split a multi-file patch into per-file sections with complete hunks. */
function splitPatchFiles(patch) {
	const files = [];
	for (const section of splitDiffSections(patch)) {
		const parsed = splitPatchFile(section);
		if (parsed !== void 0) files.push(parsed);
	}
	return files;
}
function splitPatchFile(section) {
	const lines = section.split("\n");
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	if (lines.length === 0) return void 0;
	const path = diffGitPath(lines[0] ?? "");
	if (path === void 0) return void 0;
	const firstHunk = lines.findIndex((line) => line.startsWith("@@ "));
	const header = `${(firstHunk < 0 ? lines : lines.slice(0, firstHunk)).join("\n")}\n`;
	const hunks = [];
	if (firstHunk >= 0) {
		let current = [];
		for (const line of lines.slice(firstHunk)) if (line.startsWith("@@ ")) {
			if (current.length > 0) hunks.push(`${current.join("\n")}\n`);
			current = [line];
		} else current.push(line);
		if (current.length > 0) hunks.push(`${current.join("\n")}\n`);
	}
	const binary = /Binary files .* differ|GIT binary patch/.test(section);
	const status = header.includes("new file mode") ? "added" : header.includes("deleted file mode") ? "deleted" : binary ? "binary" : "modified";
	const index = /^index ([0-9a-f]+)\.\.([0-9a-f]+)/m.exec(header);
	return {
		path,
		status,
		header,
		hunks,
		...index?.[1] === void 0 || /^0+$/.test(index[1]) ? {} : { oldBlob: index[1] },
		...index?.[2] === void 0 || /^0+$/.test(index[2]) ? {} : { newBlob: index[2] }
	};
}
/** Stable identity of one hunk block, used to bind a selection across refreshes. */
function hunkFingerprint(hunk) {
	return createHash("sha256").update(hunk).digest("hex").slice(0, 32);
}
/** Per-file views with display hunks, fingerprints and truncation limits. */
function patchFileViews(patch, maxHunks, maxBytes) {
	return splitPatchFiles(patch).map((file) => {
		const parsed = parseDiffHunks(file.header + file.hunks.join(""), maxHunks, maxBytes);
		const fingerprints = file.hunks.slice(0, parsed.hunks.length).map(hunkFingerprint);
		return {
			...file,
			view: parsed.hunks,
			fingerprints,
			truncated: parsed.truncated || file.hunks.length > parsed.hunks.length,
			binary: parsed.binary || file.status === "binary"
		};
	});
}
/**
* Undo the selected hunks of one file. The worktree is only written after the
* forward complement applied cleanly to the index.
*/
async function applyHunkUndo(provider, scratchIndex, options) {
	const rel = provider.normalizeRelPath(options.path);
	await provider.readTree(scratchIndex, options.acceptedCommit);
	const file = splitPatchFiles(await provider.diffPatch(options.acceptedCommit, void 0, [rel], {
		context: options.context,
		indexFile: scratchIndex
	})).find((item) => item.path === rel);
	if (file === void 0 || file.hunks.length === 0) return {
		ok: true,
		undone: 0
	};
	if (file.status === "binary") return {
		ok: false,
		undone: 0,
		reason: "binary"
	};
	const undo = new Set(options.undo.filter((index) => index >= 0 && index < file.hunks.length));
	if (undo.size === 0) return {
		ok: true,
		undone: 0
	};
	const keep = file.hunks.filter((_, index) => !undo.has(index));
	if (keep.length === 0) {
		if (file.status === "added") {
			await fs.promises.rm(provider.absolutePath(rel), { force: true });
			return {
				ok: true,
				undone: undo.size
			};
		}
		await provider.checkoutIndex(scratchIndex, [rel]);
		return {
			ok: true,
			undone: undo.size
		};
	}
	const unidiffZero = options.context === 0;
	const combined = file.header + keep.join("");
	let applied = await provider.applyCached(scratchIndex, combined, { unidiffZero });
	if (!applied.ok) applied = await provider.applyCached(scratchIndex, combined, {
		unidiffZero,
		threeWay: true
	});
	if (!applied.ok) return {
		ok: false,
		undone: 0,
		reason: applied.stderr || "hunk-conflict"
	};
	await provider.checkoutIndex(scratchIndex, [rel]);
	return {
		ok: true,
		undone: undo.size
	};
}
/**
* Rebuild a file as "accepted + every call except the skipped one", applying
* each call's patch forward in order. A step that no longer applies on its own
* falls back to a three-way merge (all pre-images are in the object store).
*/
async function replayPatches(provider, scratchIndex, base, steps, skip) {
	await provider.readTree(scratchIndex, base);
	const paths = /* @__PURE__ */ new Set();
	for (let index = 0; index < steps.length; index += 1) {
		if (skip.has(index)) continue;
		const step = steps[index];
		if (step.patch.trim() === "") continue;
		let applied = await provider.applyCached(scratchIndex, step.patch);
		if (!applied.ok) applied = await provider.applyCached(scratchIndex, step.patch, { threeWay: true });
		if (!applied.ok) return {
			ok: false,
			reason: applied.stderr || "patch-conflict",
			failedStep: index
		};
		paths.add(provider.normalizeRelPath(step.path));
	}
	if (paths.size > 0) await provider.checkoutIndex(scratchIndex, [...paths]);
	return { ok: true };
}
//#endregion
//#region lib/types/host/tracking.js
/**
* Per-call tracking: one write/edit tool call becomes one commit on
* `refs/dsh/head`, built entirely from git objects (docs/git-only-plan.md §2.2,
* §2.3).
*
* The hot path is a single `git hash-object -w` per call; the blob hash and the
* call metadata stay in memory until `flush()` freezes them into the chain with
* one `git fast-import`. Nothing is written to JSON, and no ref moves per call —
* so the former per-modification ledger rewrite (and its write amplification)
* is gone.
*
* Known limitation: two *concurrent* calls writing the same path can be hashed
* out of order, so the earlier call may record the later call's content. This
* cannot be repaired after the fact (the intermediate content is already gone);
* it only affects which of the two patches appears to carry the change, never
* the final state.
*/
const CHAIN_HEAD_REF = "refs/dsh/head";
/**
* The session's *list* base: the tree captured at its first turn start. Unlike
* `head` this ref never moves, so the accepted-file list can be diffed against
* it after a host restart, when the in-memory anchor (`track.base`) is either
* gone or has been re-pointed at the chain tip.
*/
const CHAIN_BASE_REF = "refs/dsh/base";
/**
* Session-start blobs for paths the chain base tree never captured.
*
* `refs/dsh/base` comes from `git add -A`, which skips ignored files (and paths
* excluded for commitless nested repositories). Without their session-start
* content the modification list can only describe such a file as newly created
* and undo would delete it, so the first write/edit intent on an unbaselined
* path records its current content here: one commit per flush, a tree entry per
* path, and no extra work at all for tracked files.
*/
const CHAIN_PRE_REF = "refs/dsh/pre";
const DEFAULT_MAX_CALLS = 500;
/** key=value lines recorded in each commit message (parsed back by `loadCalls`). */
function encodeMessage(call) {
	return [
		`callId=${call.callId}`,
		`tool=${call.toolName}`,
		`turn=${call.turn}`,
		`step=${call.step}`,
		`seq=${call.seq}`,
		`paths=${call.path}`,
		...call.deleted === true ? ["deleted=1"] : [],
		""
	].join("\n");
}
function decodeMessage(commit, message) {
	const fields = /* @__PURE__ */ new Map();
	for (const line of message.split("\n")) {
		const index = line.indexOf("=");
		if (index <= 0) continue;
		fields.set(line.slice(0, index), line.slice(index + 1));
	}
	const callId = fields.get("callId");
	const callPath = fields.get("paths");
	if (callId === void 0 || callPath === void 0) return void 0;
	const deleted = fields.get("deleted") === "1";
	return {
		callId,
		toolName: fields.get("tool") ?? "unknown",
		path: callPath,
		turn: Number(fields.get("turn") ?? "0") || 0,
		step: Number(fields.get("step") ?? "0") || 0,
		seq: Number(fields.get("seq") ?? "-1"),
		timestamp: 0,
		...deleted ? { deleted: true } : {},
		commit
	};
}
var CallTracker = class {
	ctx;
	snapshots;
	options;
	tracks = /* @__PURE__ */ new Map();
	maxCalls;
	constructor(ctx, snapshots, options) {
		this.ctx = ctx;
		this.snapshots = snapshots;
		this.options = options;
		this.maxCalls = Math.max(1, options.maxCallsPerSession ?? DEFAULT_MAX_CALLS);
	}
	/**
	* Record one observed write/edit. Synchronous by contract (`fs/observed` is a
	* synchronous event); the blob write runs on the session's serial queue.
	*
	* Paths inside a nested git repository are tracked like any other: the call is
	* captured from the file's bytes, so the embedded worktree never has to be
	* indexed (the list path stages those paths from their blob).
	*/
	observe(target, observation, actor) {
		const resolved = this.targetFor(target, actor);
		if (resolved === void 0) return;
		const { session, cwd, abs, rel: relPath } = resolved;
		const callId = actor?.callId;
		const toolName = actor?.name;
		const track = this.track(session.id, cwd);
		const position = positionForCall(session, callId);
		const fallback = sessionTurnPosition(session);
		const observed = statIdentity(abs);
		const call = {
			callId,
			toolName,
			path: relPath,
			turn: position?.turn ?? fallback?.turn ?? 0,
			step: position?.step ?? fallback?.step ?? 0,
			seq: position?.seq ?? fallback?.seq ?? -1,
			timestamp: Date.now(),
			...observed === void 0 ? { deleted: true } : { identity: observed.key }
		};
		track.calls.push(call);
		this.trim(track);
		const kind = observation.kind;
		track.queue = track.queue.then(async () => {
			if (kind === "absent") return;
			const current = statIdentity(abs);
			if (current === void 0) {
				call.superseded = true;
				delete call.deleted;
				return;
			}
			if (observed !== void 0 && current.key !== observed.key) {
				call.superseded = true;
				return;
			}
			if (current.size > this.options.maxBlobBytes) {
				call.oversized = true;
				return;
			}
			const blob = await this.snapshots.providerFor(cwd, session.id).writeBlob(abs).catch(() => void 0);
			if (blob === void 0) call.deleted = true;
			else call.blob = blob;
		}).catch(() => void 0);
	}
	/** Wait for every queued hash of one session (used before asserting on blobs). */
	async settle(sessionId) {
		await this.tracks.get(sessionId)?.queue.catch(() => void 0);
	}
	/**
	* Record the session-start content of a path the next write/edit is about to
	* replace, when the chain base tree does not contain it.
	*
	* `git add -A` refuses ignored paths, so a pre-existing file inside an
	* ignored folder is absent from `refs/dsh/base`: the modification list could
	* only call it "created" and show its whole content, and undo would delete
	* it. Capturing the pre-image at the write/edit intent (before the tool
	* mutates the file) restores the missing baseline. The read only happens on
	* the first touch of an unbaselined path that already exists; tracked files
	* are an in-memory set lookup and new files are a missing-file stat.
	*/
	async capturePreImage(target, actor) {
		const resolved = this.targetFor(target, actor);
		if (resolved === void 0) return;
		const { session, cwd, abs, rel } = resolved;
		const track = this.track(session.id, cwd);
		if (track.preImages.has(rel)) return;
		if (track.basePaths?.has(rel) === true) return;
		const provider = this.snapshots.providerFor(cwd, session.id);
		if (!await provider.available().catch(() => false)) return;
		if (!await this.ensureBasePaths(track, provider)) return;
		if (track.basePaths?.has(rel) === true) return;
		const stored = (await this.persistedPreImages(track, provider)).get(rel);
		if (stored !== void 0) {
			track.preImages.set(rel, {
				blob: stored,
				persisted: true
			});
			return;
		}
		const stat = statLstat(abs);
		if (stat === void 0) {
			track.preImages.set(rel, { absent: true });
			return;
		}
		if (!stat.isFile() || stat.isSymbolicLink()) return;
		if (await this.writtenBefore(track, provider, rel)) {
			track.preImages.set(rel, { absent: true });
			return;
		}
		if (stat.size > this.options.maxBlobBytes) {
			track.preImages.set(rel, { oversized: true });
			return;
		}
		const blob = await provider.writeBlob(abs).catch(() => void 0);
		if (blob !== void 0) track.preImages.set(rel, { blob });
	}
	/**
	* Session-start blobs of paths the base tree never captured, keyed by path.
	* In-memory entries win over `refs/dsh/pre` (which only catches up at flush).
	*/
	async preImageBlobs(cwd, sessionId) {
		const track = this.track(sessionId, cwd);
		const provider = this.snapshots.providerFor(cwd, sessionId);
		const blobs = new Map(await this.persistedPreImages(track, provider).catch(() => /* @__PURE__ */ new Map()));
		const oversized = [];
		for (const [rel, value] of track.preImages) if ("blob" in value) blobs.set(rel, value.blob);
		else if ("oversized" in value) oversized.push(rel);
		return {
			blobs,
			oversized
		};
	}
	/**
	* Ensure the session's chain base exists, capturing the full worktree once.
	* Called at turn start (before any tool call) and lazily as a fallback. When
	* calls were already recorded the base is post-write and `baseDegraded` is
	* set: the first call on each path then has no caller-level baseline.
	*/
	async ensureBase(sessionId, cwd) {
		const track = this.track(sessionId, cwd);
		if (track.base !== void 0 && track.head !== void 0) return track.head;
		const provider = this.snapshots.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return void 0;
		return this.createBase(track, provider);
	}
	/** True when the chain base was captured after calls were already recorded. */
	baseDegraded(sessionId) {
		return this.tracks.get(sessionId)?.baseDegraded === true;
	}
	/**
	* Freeze every pending call into `refs/dsh/head` and every new pre-image into
	* `refs/dsh/pre` with one fast-import. Returns the chain head commit, or
	* undefined when git is unavailable.
	*/
	async flush(sessionId) {
		const track = this.tracks.get(sessionId);
		if (track === void 0) return void 0;
		await track.queue.catch(() => void 0);
		const pending = track.calls.filter((call) => call.commit === void 0);
		const freshPre = [...track.preImages.entries()].filter(([, value]) => "blob" in value && value.persisted !== true);
		if (pending.length === 0 && freshPre.length === 0) return track.head;
		const provider = this.snapshots.providerFor(track.cwd, track.sessionId);
		if (!await provider.available().catch(() => false)) return track.head;
		const base = track.head ?? track.base ?? await this.createBase(track, provider);
		if (base === void 0) return void 0;
		const committed = pending.filter((call) => call.blob !== void 0 || call.deleted === true);
		const lines = [];
		let parent = base;
		committed.forEach((call, index) => {
			const message = encodeMessage(call);
			const length = Buffer.byteLength(message, "utf8");
			lines.push("commit refs/dsh/head");
			lines.push(`mark :${index + 1}`);
			lines.push(`committer dsh <dsh@local> ${Math.floor(call.timestamp / 1e3)} +0000`);
			lines.push(`data ${length}`);
			lines.push(message);
			lines.push(`from ${parent}`);
			lines.push(call.deleted === true || call.blob === void 0 ? `D ${call.path}` : `M 100644 ${call.blob} ${call.path}`);
			lines.push("");
			parent = `:${index + 1}`;
		});
		let previousPre;
		if (freshPre.length > 0) {
			previousPre = await provider.readRef(CHAIN_PRE_REF).catch(() => void 0);
			const message = `dsh pre-images\nsession=${track.sessionId}\n`;
			lines.push("commit refs/dsh/pre");
			lines.push(`committer dsh <dsh@local> ${Math.floor(Date.now() / 1e3)} +0000`);
			lines.push(`data ${Buffer.byteLength(message, "utf8")}`);
			lines.push(message);
			if (previousPre !== void 0) lines.push(`from ${previousPre}`);
			for (const [rel, value] of freshPre) if ("blob" in value) lines.push(`M 100644 ${value.blob} ${rel}`);
			lines.push("");
		}
		if (lines.length === 0) return base;
		await provider.fastImport(lines.join("\n"));
		if (freshPre.length > 0) {
			const persisted = track.persistedPre ?? (previousPre === void 0 ? /* @__PURE__ */ new Map() : await provider.treeBlobs(previousPre).catch(() => /* @__PURE__ */ new Map()));
			for (const [rel, value] of freshPre) if ("blob" in value) {
				persisted.set(rel, value.blob);
				value.persisted = true;
			}
			track.persistedPre = persisted;
		}
		const head = await provider.readRef(CHAIN_HEAD_REF);
		if (head === void 0) return base;
		if (committed.length > 0) {
			const list = await provider.run([
				"rev-list",
				"--reverse",
				`${base}..${head}`
			]);
			const commits = list.code === 0 ? list.stdout.split("\n").filter(Boolean) : [];
			committed.forEach((call, index) => {
				const commit = commits[index];
				if (commit !== void 0) call.commit = commit;
			});
		}
		track.head = head;
		return head;
	}
	/** Freeze every session with pending calls (turn end / shutdown best-effort). */
	async flushAll() {
		for (const sessionId of [...this.tracks.keys()]) await this.flush(sessionId).catch(() => void 0);
	}
	/** Calls of the current process, oldest first (frozen entries carry `commit`). */
	calls(sessionId) {
		return this.tracks.get(sessionId)?.calls ?? [];
	}
	/** Session base commit (the chain's first parent), when known. */
	base(sessionId) {
		return this.tracks.get(sessionId)?.base;
	}
	/**
	* The session's list base (`refs/dsh/base`), which is the chain *root* no
	* matter how the in-memory anchor was set. Chains created before the ref
	* existed are backfilled once from the parentless root of `refs/dsh/head`.
	* Returns undefined when the session has no chain at all.
	*/
	async readBase(cwd, sessionId) {
		const provider = this.snapshots.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return this.tracks.get(sessionId)?.base;
		const stored = await provider.readRef(CHAIN_BASE_REF);
		if (stored !== void 0) return stored;
		const head = await provider.readRef("refs/dsh/head") ?? this.tracks.get(sessionId)?.head;
		if (head === void 0) return this.tracks.get(sessionId)?.base;
		const roots = await provider.roots(head).catch(() => []);
		const root = roots[roots.length - 1];
		if (root === void 0) return void 0;
		await provider.updateRef(CHAIN_BASE_REF, root).catch(() => false);
		return root;
	}
	head(sessionId) {
		return this.tracks.get(sessionId)?.head;
	}
	/** Paths touched by this session's calls (hashed form, forward slashes). */
	pathsForSession(sessionId) {
		return new Set(this.calls(sessionId).map((call) => call.path));
	}
	/** Paths seen but not captured because they exceeded `maxBlobBytes`. */
	oversizedPaths(sessionId) {
		return new Set(this.calls(sessionId).filter((call) => call.oversized === true).map((call) => call.path));
	}
	/**
	* Cold read: rebuild the call list from the commit chain, so patch identity
	* survives a process restart for everything already frozen (unfrozen calls
	* are intentionally lost — docs/git-only-plan.md §4.4).
	*/
	async loadCalls(cwd, sessionId) {
		const live = this.tracks.get(sessionId);
		if (live !== void 0) {
			if (!live.calls.some((call) => call.commit === void 0) && live.calls.length > 0) return live.calls;
		}
		const provider = this.snapshots.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return live?.calls ?? [];
		const log = await provider.run([
			"log",
			"--format=%H%x00%ct%x00%B%x1e",
			CHAIN_HEAD_REF
		]);
		if (log.code !== 0) return live?.calls ?? [];
		const calls = [];
		for (const record of log.stdout.split("")) {
			const parts = record.split("\0");
			if (parts.length < 3) continue;
			const commit = (parts[0] ?? "").trim();
			const timestamp = Number(parts[1] ?? "0") * 1e3;
			const call = decodeMessage(commit, parts[2] ?? "");
			if (call === void 0) continue;
			call.timestamp = timestamp;
			calls.push(call);
		}
		calls.reverse();
		if (live !== void 0 && calls.length > 0) {
			for (const call of live.calls) if (call.commit !== void 0 && !calls.some((item) => item.callId === call.callId)) calls.push(call);
		}
		return calls;
	}
	/** Forget in-memory state (session close / tests). */
	reset(sessionId) {
		if (sessionId === void 0) this.tracks.clear();
		else this.tracks.delete(sessionId);
	}
	/** Resolve an fs event to its session, workspace, absolute and relative path. */
	targetFor(target, actor) {
		const callId = actor?.callId;
		const toolName = actor?.name;
		const agentSession = actor?.agent?.session;
		if (callId === void 0 || agentSession === void 0) return void 0;
		if (toolName !== "write" && toolName !== "edit") return void 0;
		const session = attributionSession(this.ctx, agentSession);
		const cwd = session.header?.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		const abs = this.ctx.fs.processPath(target);
		const rel = relativeToCwd(cwd, abs);
		if (rel === void 0) return void 0;
		return {
			session,
			cwd,
			abs,
			rel
		};
	}
	/**
	* Load the set of paths the chain base tree contains, once per session. The
	* base capture already runs `add -A`; this is one extra `ls-tree` at base
	* creation (or the first unbaselined write after a restart) that lets every
	* later intent classify its path without touching git.
	*/
	async ensureBasePaths(track, provider) {
		if (track.basePaths !== void 0) return true;
		track.basePathsLoading ??= (async () => {
			const base = await this.readBase(track.cwd, track.sessionId).catch(() => void 0);
			if (base === void 0) return;
			const tree = await provider.treeOf(base).catch(() => void 0);
			if (tree === void 0) return;
			const paths = await provider.pathsInTree(tree).catch(() => void 0);
			if (paths !== void 0) track.basePaths = new Set(paths);
		})();
		await track.basePathsLoading.catch(() => void 0);
		return track.basePaths !== void 0;
	}
	/** Blobs persisted in `refs/dsh/pre` (empty until the first flush). */
	async persistedPreImages(track, provider) {
		if (track.persistedPre !== void 0) return track.persistedPre;
		const ref = await provider.readRef(CHAIN_PRE_REF).catch(() => void 0);
		track.persistedPre = ref === void 0 ? /* @__PURE__ */ new Map() : await provider.treeBlobs(ref).catch(() => /* @__PURE__ */ new Map());
		return track.persistedPre;
	}
	/**
	* Whether this session already wrote the path before the current intent. A
	* yes without a persisted pre-image means the path was created by the
	* session, so its session-start state is "absent".
	*/
	async writtenBefore(track, provider, rel) {
		if (track.calls.some((call) => call.path === rel)) return true;
		return (await this.loadCalls(track.cwd, track.sessionId).catch(() => [])).some((call) => call.path === rel);
	}
	track(sessionId, cwd) {
		const existing = this.tracks.get(sessionId);
		if (existing !== void 0 && path.resolve(existing.cwd) === path.resolve(cwd)) return existing;
		const created = {
			sessionId,
			cwd,
			calls: [],
			preImages: /* @__PURE__ */ new Map(),
			queue: Promise.resolve()
		};
		this.tracks.set(sessionId, created);
		return created;
	}
	/** Session base commit: a full worktree capture, committed once per session. */
	async createBase(track, provider) {
		const existing = await provider.readRef(CHAIN_HEAD_REF);
		if (existing !== void 0) {
			track.base = existing;
			track.head = existing;
			if (await provider.readRef("refs/dsh/base") === void 0) {
				const roots = await provider.roots(existing).catch(() => []);
				const root = roots[roots.length - 1];
				if (root !== void 0) await provider.updateRef(CHAIN_BASE_REF, root).catch(() => false);
			}
			return existing;
		}
		if (track.calls.length > 0) track.baseDegraded = true;
		const tree = await provider.captureTree().catch(() => void 0);
		if (tree === void 0) return void 0;
		const commit = await provider.commitTree(tree, [], `dsh base\nsession=${track.sessionId}\n`);
		await provider.updateRef(CHAIN_HEAD_REF, commit);
		await provider.updateRef(CHAIN_BASE_REF, commit).catch(() => false);
		track.base = commit;
		track.head = commit;
		track.basePaths = new Set(await provider.pathsInTree(tree).catch(() => []));
		return commit;
	}
	trim(track) {
		const overflow = track.calls.length - this.maxCalls;
		if (overflow > 0) track.calls.splice(0, overflow);
	}
};
/**
* Workspace-relative path with forward slashes, or undefined when the path is
* outside the workspace (or is the workspace root itself).
*/
function relativeToCwd(cwd, abs) {
	const rel = path.relative(cwd, abs);
	if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return void 0;
	return rel.split(path.sep).join("/");
}
function statLstat(abs) {
	try {
		return fs.lstatSync(abs);
	} catch {
		return;
	}
}
/**
* Cheap synchronous identity of a file, captured when the observation arrives.
* Re-checked before hashing so a call whose content was already replaced by a
* later call is dropped instead of mis-attributed.
*/
function statIdentity(abs) {
	try {
		const stat = fs.statSync(abs);
		if (!stat.isFile()) return void 0;
		return {
			key: `${stat.size}:${stat.mtimeMs}:${stat.ino}`,
			size: stat.size
		};
	} catch {
		return;
	}
}
/** The session-log position of a tool call (turn/step/seq). */
function positionForCall(session, callId) {
	const events = session.snapshotEvents();
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event === void 0 || event.type !== "tool/call") continue;
		const data = event.data;
		if (data.callId !== callId) continue;
		return {
			turn: data.turn ?? 0,
			step: data.step ?? 0,
			seq: event.seq
		};
	}
}
/** Fallback coordinates: the session's currently open turn/step. */
function sessionTurnPosition(session) {
	let turn = 0;
	let step = 0;
	let seq = -1;
	for (const event of session.snapshotEvents()) {
		seq = event.seq;
		if (event.type === "turn/start") turn = event.data.turn;
		if (event.type === "step/start") step = event.data.step;
	}
	return turn > 0 ? {
		turn,
		step,
		seq
	} : void 0;
}
//#endregion
//#region lib/types/host/session-changes.js
var SessionChangeManager = class {
	ctx;
	snapshots;
	tracker;
	accepts;
	safety;
	options;
	bound = /* @__PURE__ */ new Map();
	/** Last effective baseline tree per session, keyed by chain base + pre-image paths. */
	baselineTrees = /* @__PURE__ */ new Map();
	/**
	* In-flight turn-start pipelines (worktree point capture + gap recording).
	* A list read awaits the pending one, so the interval that just ended is
	* already in the gap trees when the dock refreshes at the new turn.
	*/
	startingTurns = /* @__PURE__ */ new Map();
	/** Turn starts whose gap was already recorded (or proven not applicable). */
	recordedGaps = /* @__PURE__ */ new Set();
	/**
	* In-flight boundary captures are tracked inside SnapshotManager's per-session
	* capture queue; the list awaits `waitForCaptures()` before reading a
	* boundary so it never uses a tree whose capture is still running.
	*/
	constructor(ctx, snapshots, tracker, accepts, safety, options) {
		this.ctx = ctx;
		this.snapshots = snapshots;
		this.tracker = tracker;
		this.accepts = accepts;
		this.safety = safety;
		this.options = options;
	}
	/**
	* Record the turn-end boundary when a turn finishes. The capture runs after
	* `turn/end` is appended, so it contains everything the turn produced;
	* changes made afterwards are excluded while the session stays idle. The
	* O(worktree) capture is skipped when the session never created a snapshot
	* repository (nothing could be listed anyway). Subagent sessions fold into
	* their main session.
	*/
	noteTurnEnd(session, turn) {
		this.finishTurnStart(session.id);
		if (isSubagentSession(session)) return void 0;
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		if (!this.snapshots.hasRepository(cwd, session.id)) return void 0;
		return this.snapshots.captureTurnEnd(session, turn).catch(() => void 0);
	}
	/**
	* Register the turn-start pipeline before its worktree capture begins.
	*
	* The dock refreshes as soon as `turn/start` is appended, which can be
	* before the capture and its gap recording finish. A list read awaits this
	* promise, so the first refresh of the new turn already excludes the
	* out-of-turn changes of the interval that just ended. The returned settle
	* function is idempotent, so callers can put it in a `finally`.
	*/
	beginTurnStart(session, turn) {
		if (isSubagentSession(session)) return () => {};
		const existing = this.startingTurns.get(session.id);
		if (existing !== void 0 && existing.turn === turn) return existing.settle;
		if (existing !== void 0) this.finishTurnStart(session.id);
		let resolve;
		const settled = new Promise((done) => {
			resolve = done;
		});
		let done = false;
		const settle = () => {
			if (done) return;
			done = true;
			if (this.startingTurns.get(session.id)?.settled === settled) this.startingTurns.delete(session.id);
			resolve();
		};
		this.startingTurns.set(session.id, {
			turn,
			settled,
			settle
		});
		return settle;
	}
	/** Release a pending turn-start wait (the turn ended before its pipeline did). */
	finishTurnStart(sessionId) {
		this.startingTurns.get(sessionId)?.settle();
	}
	/**
	* Record the gap between the previous completed turn and this turn's start.
	*
	* The boundary is the nearest `turn/end` before this turn's `turn/start`,
	* not literally the immediately preceding event: the runtime appends
	* bookkeeping events between turns (`agent/inbox/spliced` when the next
	* message is queued, title generation, persistence receipts), and requiring
	* an adjacent `turn/end` silently disabled gap recording after the first
	* turn. Restore markers are skipped; an aborted/mid-turn close (nearest
	* turn event is a `turn/start`) and a fork seed marker are still rejected,
	* because their previous boundary would include work that is not a gap.
	*/
	noteTurnStart(session, turn, startTree) {
		if (isSubagentSession(session)) return void 0;
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		if (!this.snapshots.hasRepository(cwd, session.id)) return void 0;
		const previous = previousTurnEnd(session, turn);
		if (previous === void 0) return void 0;
		return this.recordStartGap(session, turn, startTree, previous.time);
	}
	/**
	* Apply one turn-start gap at most once. The cumulative gap trees make a
	* repeated application idempotent, but the guard keeps every refresh from
	* re-running the tree diff.
	*/
	recordStartGap(session, turn, startTree, boundaryAt) {
		const key = gapKey(session.id, turn);
		if (this.recordedGaps.has(key)) return void 0;
		this.recordedGaps.add(key);
		return this.snapshots.recordGap(session, turn, startTree, boundaryAt).catch(() => void 0);
	}
	/**
	* Record the current turn's start gap when the eager pre-step pipeline did
	* not (a refresh that raced its registration, or a host restart in the
	* middle of a turn). Only a *running* turn is eligible: once it has ended,
	* `refs/dsh/turn-end` belongs to this turn, so it can no longer bound the
	* interval before it — using it would record this turn's own work as an
	* out-of-turn gap.
	*/
	async ensureStartGap(session) {
		if (isSubagentSession(session) || sessionIdleEnd(session) !== void 0) return;
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return;
		const turn = currentTurn(session);
		if (turn === void 0) return;
		const key = gapKey(session.id, turn);
		if (this.recordedGaps.has(key)) return;
		const previous = previousTurnEnd(session, turn);
		if (previous === void 0) return;
		const tree = (await this.snapshots.findExact(cwd, session.id, turn).catch(() => void 0))?.tree;
		if (tree === void 0) return;
		await this.recordStartGap(session, turn, tree, previous.time);
	}
	/**
	* Record the session's end boundary when it is disposed (closed, or the
	* host shuts down). This is the fallback for a close that happened inside a
	* turn, where no turn-end capture covers the final state. Sessions that
	* never wrote through the tracked chain and never accepted anything have no
	* modification list to protect, so the O(worktree) capture is skipped.
	*/
	noteSessionEnd(session) {
		if (isSubagentSession(session)) return void 0;
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		const sessionId = session.id;
		if (!this.snapshots.hasRepository(cwd, sessionId)) return void 0;
		return (async () => {
			const provider = this.snapshots.providerFor(cwd, sessionId);
			if (!await provider.available().catch(() => false)) return;
			const [head, accepted] = await Promise.all([provider.readRef(CHAIN_HEAD_REF).catch(() => void 0), provider.readRef(ACCEPTED_REF).catch(() => void 0)]);
			if (head === void 0 && accepted === void 0) return;
			await this.snapshots.captureEnd(session);
		})().catch(() => void 0);
	}
	async sessionChanges(sessionId) {
		const live = this.liveSession(sessionId);
		if (!live.ok) return live;
		const session = live.value;
		const cwd = session.header.cwd ?? "";
		if (cwd === "") return failure("session-not-live", `session "${sessionId}" has no workspace cwd`, { sessionId });
		const starting = this.startingTurns.get(sessionId);
		if (starting !== void 0) await starting.settled;
		const warnings = [];
		const provider = this.snapshots.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return failure("rollback-failed", "the isolated git snapshot repository is unavailable for this workspace", { sessionId });
		await this.tracker.flush(sessionId);
		const chainBase = await this.seedTree(sessionId, cwd);
		if (chainBase === void 0) warnings.push("this session has no chain base, so already-accepted files cannot be listed");
		const pre = await this.tracker.preImageBlobs(cwd, sessionId).catch(() => ({
			blobs: /* @__PURE__ */ new Map(),
			oversized: []
		}));
		const baselineTree = chainBase === void 0 ? void 0 : await this.baselineWithPreImages(provider, sessionId, chainBase, pre.blobs, warnings);
		const seeded = await this.accepts.ensureBaseline(cwd, sessionId, baselineTree, pre.blobs);
		const accepted = seeded.commit;
		if (accepted === void 0) {
			if (chainBase === void 0) return ok(this.emptyValue(session, warnings));
			return failure("rollback-failed", "no accepted baseline could be established for this session", { sessionId });
		}
		if (seeded.skipped.length > 0) warnings.push(`the session-start content of ${summarize(seeded.skipped)} could not be folded into the baseline; those files are listed as newly created`);
		for (const rel of pre.oversized) warnings.push(`"${rel}" is in an ignored path and exceeds maxBlobBytes; its session-start content was not captured, so the whole file is listed`);
		const acceptedTree = await provider.treeOf(accepted).catch(() => void 0);
		const calls = await this.tracker.loadCalls(cwd, sessionId);
		const trackedPaths = [...new Set(calls.map((call) => call.path))];
		const capturedPaths = await this.pathsAddedSinceCapture(provider, acceptedTree, cwd, sessionId, new Set(trackedPaths), warnings);
		const stagedPaths = [...new Set([...trackedPaths, ...capturedPaths])];
		const nestedRoots = await this.nestedRoots(provider);
		const isNestedPath = (rel) => nestedRoots.some((root) => rel === root || rel.startsWith(`${root}/`));
		const nestedPaths = stagedPaths.filter(isNestedPath);
		const plainPaths = stagedPaths.filter((rel) => !isNestedPath(rel));
		const views = patchFileViews(await provider.withScratch(async (scratch) => {
			await provider.readTree(scratch, accepted);
			await provider.stagePaths(scratch, plainPaths);
			await provider.stagePathsByContent(scratch, nestedPaths);
			return provider.diffPatch(accepted, void 0, [], {
				context: this.options.diffContextLines,
				indexFile: scratch
			});
		}), this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile);
		const probe = /* @__PURE__ */ new Map();
		const changes = views.map((view) => {
			probe.set(view.path, view.newBlob);
			const nested = isNestedPath(view.path);
			const created = view.status === "added";
			return {
				path: view.path,
				absolutePath: provider.absolutePath(view.path),
				status: created ? "created" : view.status === "deleted" ? "deleted" : view.binary ? "binary" : "modified",
				source: "git",
				restorable: !view.binary,
				accepted: false,
				...created ? { createdAfterSnapshot: true } : {},
				...view.binary ? { binary: true } : {},
				...view.truncated ? { truncated: true } : {},
				...nested ? { nested: true } : {},
				...view.view.length > 0 ? { hunks: view.view } : {}
			};
		});
		const foreign = await foreignPaths(provider, calls, changes.map((change) => change.path), probe);
		for (const change of changes) if (foreign.has(change.path)) change.foreign = true;
		await this.snapshots.waitForCaptures(cwd, sessionId);
		await this.ensureStartGap(session);
		const gapState = await this.snapshots.gapState(cwd, sessionId).catch(() => ({}));
		const hidden = await this.dropGapChanges(provider, changes, probe, gapState, warnings);
		const idle = sessionIdleEnd(session);
		if (idle !== void 0) {
			const boundary = idle.turnEnded ? await this.snapshots.turnEndBoundary(cwd, sessionId).catch(() => void 0) : await this.snapshots.endBoundary(cwd, sessionId).catch(() => void 0);
			const endTree = boundary !== void 0 && boundary.createdAt + 1e3 >= idle.endedAt ? boundary.tree : void 0;
			const boundaryHidden = await this.dropAfterBoundaryChanges(provider, changes, probe, idle.endedAt, idle.turnEnded ? "turn" : "session", endTree, warnings);
			for (const rel of boundaryHidden) hidden.add(rel);
		}
		const modifications = (await this.modifications(provider, accepted, calls, baselineTree, pre.blobs)).filter((item) => !hidden.has(item.path));
		const pending = new Set([...changes.map((change) => change.path), ...hidden]);
		const acceptedRows = await this.acceptedRows(provider, baselineTree, accepted, pending, warnings, acceptedTree);
		attachToolCalls(changes, modifications);
		for (const rel of this.tracker.oversizedPaths(sessionId)) if (!probe.has(rel)) warnings.push(`"${rel}" exceeds maxBlobBytes and is only rollback-able at turn granularity`);
		if (this.tracker.baseDegraded(sessionId)) warnings.push("the call chain baseline was captured after the session started; the first write to each path has no caller-level patch");
		const listId = crypto.randomUUID();
		this.bound.set(listId, {
			listId,
			sessionId,
			cwd,
			accepted,
			...baselineTree === void 0 ? {} : { sessionBase: baselineTree },
			preImages: pre.blobs,
			probe,
			changes,
			excluded: new Set(hidden),
			createdAt: Date.now()
		});
		while (this.bound.size > 32) {
			const oldest = this.bound.keys().next().value;
			if (oldest === void 0) break;
			this.bound.delete(oldest);
		}
		const allChanges = [...changes, ...acceptedRows];
		return ok({
			listId,
			baseline: {
				turn: sessionStartTurn(session),
				createdAt: Date.now(),
				mode: "git"
			},
			changes: allChanges,
			modifications,
			acceptedFiles: acceptedRows.map((row) => row.path),
			acceptedModifications: modifications.filter((item) => item.accepted === true).map((item) => item.modificationId),
			warnings: [...new Set(warnings)]
		});
	}
	/**
	* Manual refresh: while a turn is running, take a fresh full-worktree
	* capture first (`refs/dsh/progress`) so files created by bash/scripts
	* since the last boundary become discoverable immediately. An idle session
	* already has a turn-end/session-end capture covering its current state, so
	* it is listed without another O(worktree) scan. The capture is best-effort:
	* a failure leaves the previous capture in place and the list still loads.
	*/
	async refreshSessionChanges(sessionId) {
		const live = this.liveSession(sessionId);
		if (live.ok && !isSubagentSession(live.value) && sessionIdleEnd(live.value) === void 0) await this.snapshots.captureProgress(live.value, currentTurn(live.value)).catch(() => void 0);
		return this.sessionChanges(sessionId);
	}
	async acceptFile(request) {
		const bound = this.requireBound(request.listId, request.sessionId);
		if (!bound.ok) return bound;
		const rel = safeRel(this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId), request.path);
		if (rel === void 0) return failure("path-not-in-snapshot", `path "${request.path}" is not a valid workspace path`, { sessionId: request.sessionId });
		const accepted = await this.accepts.acceptPaths(bound.value.cwd, bound.value.sessionId, [rel], {
			message: "accept file",
			...bound.value.sessionBase === void 0 ? {} : { seedTree: bound.value.sessionBase }
		});
		if (!accepted.ok) return failure("rollback-failed", `accepting "${rel}" failed`, {
			sessionId: request.sessionId,
			detail: accepted.reason
		});
		return ok(await this.acceptValue(bound.value, [rel], accepted.blobs));
	}
	async acceptModification(request) {
		const bound = this.requireBound(request.listId, request.sessionId);
		if (!bound.ok) return bound;
		const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
		const located = await this.locatePatch(bound.value, provider, request.modificationId);
		if (located === void 0) return failure("rollback-failed", `patch "${request.modificationId}" is no longer known`, { sessionId: request.sessionId });
		const accepted = await this.accepts.acceptPatch(bound.value.cwd, bound.value.sessionId, located.call.path, located.patch, {
			...bound.value.sessionBase === void 0 ? {} : { seedTree: bound.value.sessionBase },
			...located.view?.oldBlob === void 0 ? {} : { beforeBlob: located.view.oldBlob },
			...located.view?.newBlob === void 0 ? {} : { afterBlob: located.view.newBlob }
		});
		if (!accepted.ok) return failure("patch-conflict", `accepting patch "${request.modificationId}" failed`, {
			sessionId: request.sessionId,
			detail: accepted.reason,
			paths: [located.call.path]
		});
		return ok(await this.acceptValue(bound.value, [located.call.path], accepted.blobs));
	}
	async acceptAll(request) {
		const bound = this.requireBound(request.listId, request.sessionId);
		if (!bound.ok) return bound;
		const paths = bound.value.changes.map((change) => change.path);
		const accepted = await this.accepts.acceptPaths(bound.value.cwd, bound.value.sessionId, paths, {
			message: "accept all",
			...bound.value.sessionBase === void 0 ? {} : { seedTree: bound.value.sessionBase }
		});
		if (!accepted.ok) return failure("rollback-failed", "accepting the modification list failed", {
			sessionId: request.sessionId,
			detail: accepted.reason
		});
		return ok({
			acceptedFiles: paths,
			acceptedModifications: await this.acceptedPatchIds(bound.value, paths, accepted.blobs)
		});
	}
	async undoFile(request) {
		const bound = this.requireBound(request.listId, request.sessionId);
		if (!bound.ok) return bound;
		const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
		const rel = safeRel(provider, request.path);
		if (rel === void 0) return failure("path-not-in-snapshot", `path "${request.path}" is not a valid workspace path`, { sessionId: request.sessionId });
		if (bound.value.excluded.has(rel)) return failure("workspace-changed", `"${rel}" was changed outside this session's turns and is not part of the rollback scope`, {
			sessionId: request.sessionId,
			paths: [rel]
		});
		const outcome = await this.withUndo(bound.value, [rel], async () => {
			if (await this.accepts.acceptedBlob(bound.value.cwd, bound.value.sessionId, rel) === void 0) {
				await fs.promises.rm(provider.absolutePath(rel), { force: true });
				return {
					deleted: [rel],
					acceptedPaths: [rel]
				};
			}
			await provider.restorePaths(bound.value.accepted, [rel]);
			return {
				restored: [rel],
				acceptedPaths: [rel]
			};
		});
		if (!outcome.ok) return outcome;
		return ok({
			guardId: outcome.guardId,
			restored: outcome.run.restored ?? [],
			deleted: outcome.run.deleted ?? [],
			kept: outcome.run.kept ?? [],
			skipped: outcome.run.skipped ?? [],
			acceptedFiles: outcome.run.acceptedPaths
		});
	}
	async undoModification(request) {
		const bound = this.requireBound(request.listId, request.sessionId);
		if (!bound.ok) return bound;
		const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
		const located = await this.locatePatch(bound.value, provider, request.modificationId);
		if (located === void 0) return failure("rollback-failed", `patch "${request.modificationId}" is no longer known`, { sessionId: request.sessionId });
		const rel = located.call.path;
		if (bound.value.excluded.has(rel)) return failure("workspace-changed", `"${rel}" was changed outside this session's turns and is not part of the rollback scope`, {
			sessionId: request.sessionId,
			paths: [rel]
		});
		let results = [];
		const outcome = await this.withUndo(bound.value, [rel], async () => {
			const chain = (await this.tracker.loadCalls(bound.value.cwd, bound.value.sessionId)).filter((call) => call.path === rel && call.commit !== void 0);
			const acceptedBlob = await this.accepts.acceptedBlob(bound.value.cwd, bound.value.sessionId, rel);
			const blobs = await this.callBlobs(provider, chain);
			const steps = [];
			const ids = [];
			for (const call of chain) {
				const blob = blobs.get(call.callId);
				if (blob !== void 0 && blob === acceptedBlob) continue;
				steps.push({
					path: rel,
					patch: await this.callPatch(provider, call, bound.value.sessionBase, bound.value.preImages)
				});
				ids.push(call.callId);
			}
			const skip = ids.indexOf(request.modificationId);
			if (skip < 0) {
				results = [{
					modificationId: request.modificationId,
					path: rel,
					status: "restored"
				}];
				return { acceptedPaths: [] };
			}
			const replay = await provider.withScratch((scratch) => replayPatches(provider, scratch, bound.value.accepted, steps, new Set([skip])));
			if (!replay.ok) {
				results = [{
					modificationId: request.modificationId,
					path: rel,
					status: "conflict",
					...replay.reason === void 0 ? {} : { detail: replay.reason }
				}];
				return { acceptedPaths: [] };
			}
			results = [{
				modificationId: request.modificationId,
				path: rel,
				status: "restored"
			}];
			return {
				restored: [rel],
				acceptedPaths: [rel]
			};
		});
		if (!outcome.ok) return outcome;
		return ok({
			guardId: outcome.guardId,
			modificationResults: results,
			acceptedModifications: await this.acceptedPatchIds(bound.value, outcome.run.acceptedPaths)
		});
	}
	async undoHunks(request) {
		const bound = this.requireBound(request.listId, request.sessionId);
		if (!bound.ok) return bound;
		const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
		const rel = safeRel(provider, request.path);
		if (rel === void 0) return failure("path-not-in-snapshot", `path "${request.path}" is not a valid workspace path`, { sessionId: request.sessionId });
		if (bound.value.excluded.has(rel)) return failure("workspace-changed", `"${rel}" was changed outside this session's turns and is not part of the rollback scope`, {
			sessionId: request.sessionId,
			paths: [rel]
		});
		let undone = 0;
		let conflict;
		const outcome = await this.withUndo(bound.value, [rel], async () => {
			const applied = await provider.withScratch((scratch) => applyHunkUndo(provider, scratch, {
				acceptedCommit: bound.value.accepted,
				path: rel,
				undo: request.hunks,
				context: this.options.diffContextLines
			}));
			if (!applied.ok) {
				conflict = applied.reason ?? "hunk-conflict";
				return { acceptedPaths: [] };
			}
			undone = applied.undone;
			return {
				restored: [rel],
				acceptedPaths: [rel]
			};
		});
		if (!outcome.ok) return outcome;
		if (conflict !== void 0) return failure("hunk-conflict", `undoing hunks of "${rel}" failed`, {
			sessionId: request.sessionId,
			detail: conflict,
			paths: [rel]
		});
		return ok({
			guardId: outcome.guardId,
			undone,
			acceptedFiles: outcome.run.acceptedPaths,
			acceptedModifications: await this.acceptedPatchIds(bound.value, outcome.run.acceptedPaths)
		});
	}
	async undoAll(request) {
		const bound = this.requireBound(request.listId, request.sessionId);
		if (!bound.ok) return bound;
		const provider = this.snapshots.providerFor(bound.value.cwd, bound.value.sessionId);
		const paths = bound.value.changes.map((change) => provider.normalizeRelPath(change.path));
		const outcome = await this.withUndo(bound.value, paths, async () => {
			const restored = [];
			const deleted = [];
			const accepted = await this.acceptedBlobMap(bound.value, provider, paths);
			for (const rel of paths) if (accepted.get(rel) === void 0) {
				await fs.promises.rm(provider.absolutePath(rel), { force: true });
				deleted.push(rel);
			} else restored.push(rel);
			if (restored.length > 0) await provider.restorePaths(bound.value.accepted, restored);
			return {
				restored,
				deleted,
				acceptedPaths: paths
			};
		});
		if (!outcome.ok) return outcome;
		return ok({
			guardId: outcome.guardId,
			restored: outcome.run.restored ?? [],
			deleted: outcome.run.deleted ?? [],
			kept: outcome.run.kept ?? [],
			skipped: outcome.run.skipped ?? [],
			acceptedFiles: outcome.run.acceptedPaths
		});
	}
	/**
	* Shared undo skeleton: verify the listed worktree state is unchanged, take
	* the workspace lock, fence, flush the session, guard the affected paths, run
	* the mutation, journal it, and auto-accept the result.
	*/
	async withUndo(bound, paths, run) {
		const live = this.liveSession(bound.sessionId);
		if (!live.ok) return live;
		const provider = this.snapshots.providerFor(bound.cwd, bound.sessionId);
		const unique = [...new Set(paths)];
		const current = await provider.hashBlobs(unique).catch(() => /* @__PURE__ */ new Map());
		for (const rel of unique) {
			const expected = bound.probe.get(rel);
			if (current.get(rel) !== expected) return failure("workspace-changed", `"${rel}" changed after the list was read; refresh and try again`, {
				sessionId: bound.sessionId,
				paths: [rel]
			});
		}
		await this.safety.acquire(bound.cwd);
		let journalId;
		try {
			await this.safety.assertFences(this.ctx, bound.cwd, provider);
			await this.ctx.sessions.flush(live.value);
			const guard = await this.safety.captureGuard(provider, {
				cwd: bound.cwd,
				sessionId: bound.sessionId
			}, unique);
			journalId = await this.safety.journalStart(provider, guard, unique);
			try {
				const result = await run();
				await this.safety.journalUpdate(provider, journalId, "completed");
				if (result.acceptedPaths.length > 0) await this.accepts.acceptPaths(bound.cwd, bound.sessionId, result.acceptedPaths, {
					message: "auto accept after undo",
					...bound.sessionBase === void 0 ? {} : { seedTree: bound.sessionBase }
				});
				return {
					ok: true,
					guardId: guard.guardId,
					run: result
				};
			} catch (error) {
				await this.safety.restoreGuard(provider, guard, unique).catch(() => void 0);
				await this.safety.journalUpdate(provider, journalId, "rolled-back");
				return failure("rollback-failed", error instanceof Error ? error.message : "rollback failed", {
					sessionId: bound.sessionId,
					paths: unique
				});
			}
		} catch (error) {
			if (journalId !== void 0) await this.safety.journalUpdate(provider, journalId, "interrupted").catch(() => void 0);
			return failure("rollback-failed", error instanceof Error ? error.message : "rollback failed", { sessionId: bound.sessionId });
		} finally {
			await this.safety.release().catch(() => void 0);
		}
	}
	requireBound(listId, sessionId) {
		const bound = this.bound.get(listId);
		if (bound === void 0 || bound.sessionId !== sessionId) return failure("workspace-changed", "the modification list is stale; refresh it and try again", { sessionId });
		return {
			ok: true,
			value: bound
		};
	}
	liveSession(sessionId) {
		const session = this.ctx.sessions.get(sessionId);
		if (session === void 0) return failure("session-not-found", `unknown session "${sessionId}"`, { sessionId });
		const cwd = session.header?.cwd;
		if (cwd === void 0 || cwd === "") return failure("session-not-live", `session "${sessionId}" has no workspace cwd`, { sessionId });
		return {
			ok: true,
			value: session
		};
	}
	/**
	* Turn-start tree of this session, used to seed the accepted baseline. Read
	* from the persisted `refs/dsh/base` rather than the in-memory anchor: after
	* a host restart that anchor is gone or has been re-pointed at the chain tip,
	* which would silently drop every already-accepted file from the list.
	*/
	async seedTree(sessionId, cwd) {
		const base = await this.tracker.readBase(cwd, sessionId).catch(() => void 0);
		if (base === void 0) return void 0;
		return this.snapshots.providerFor(cwd, sessionId).treeOf(base).catch(() => void 0);
	}
	/**
	* The chain-base tree with the session-start contents of paths the base
	* capture could never see (ignored files, excluded nested paths) added on
	* top. This is the baseline both the accepted seed and the "already
	* accepted" group compare against.
	*
	* A path that would fall under a gitlink in the base tree cannot also be a
	* file (a non-materialized nested repo): those stay on the whole-file
	* behaviour and are reported once as a warning.
	*/
	async baselineWithPreImages(provider, sessionId, baseTree, preImages, warnings) {
		if (preImages.size === 0) return baseTree;
		const key = `${baseTree}\0${[...preImages.keys()].sort().join("\0")}`;
		const cached = this.baselineTrees.get(sessionId);
		if (cached !== void 0 && cached.key === key) return cached.tree;
		const skipped = [];
		try {
			const tree = await provider.withScratch(async (scratch) => {
				await provider.readTree(scratch, baseTree);
				const entries = [...preImages].map(([path, blob]) => ({
					path,
					blob
				}));
				try {
					await provider.updateIndexInfo(scratch, entries);
				} catch {
					for (const entry of entries) try {
						await provider.updateIndexInfo(scratch, [entry]);
					} catch {
						skipped.push(entry.path);
					}
				}
				return provider.writeTree(scratch);
			});
			if (skipped.length > 0) warnings.push(`the session-start content of ${summarize(skipped)} is outside the baseline tree; those files are listed as newly created`);
			else {
				this.baselineTrees.set(sessionId, {
					key,
					tree
				});
				while (this.baselineTrees.size > 64) {
					const oldest = this.baselineTrees.keys().next().value;
					if (oldest === void 0) break;
					this.baselineTrees.delete(oldest);
				}
			}
			return tree;
		} catch {
			warnings.push("session-start content for ignored paths could not be merged into the baseline tree; those files are listed as newly created");
			return baseTree;
		}
	}
	/** A list with nothing to show (no chain, no accept baseline yet). */
	emptyValue(session, warnings) {
		return {
			listId: crypto.randomUUID(),
			baseline: {
				turn: sessionStartTurn(session),
				createdAt: Date.now(),
				mode: "git"
			},
			changes: [],
			modifications: [],
			acceptedFiles: [],
			acceptedModifications: [],
			warnings: [...new Set(warnings)]
		};
	}
	/**
	* Drop foreign rows whose current content was last changed outside a turn.
	*
	* `refs/dsh/gap` holds the cumulative content of paths whose last gap change
	* produced a file; `refs/dsh/gap-deleted` holds paths whose last gap change
	* removed one. Ownership is checked first, so a path a turn wrote again (even
	* back to the old gap content) is never dropped here. Paths absent from both
	* trees were not observed in a gap and stay listed.
	*/
	async dropGapChanges(provider, changes, probe, state, warnings) {
		const hidden = /* @__PURE__ */ new Set();
		const candidates = changes.filter((change) => change.foreign === true);
		if (candidates.length === 0) return hidden;
		const { gapTree, deletedTree } = state;
		if (gapTree === void 0 && deletedTree === void 0) return hidden;
		const specs = [];
		if (gapTree !== void 0) for (const change of candidates) specs.push({
			treeish: gapTree,
			path: change.path
		});
		if (deletedTree !== void 0) for (const change of candidates) specs.push({
			treeish: deletedTree,
			path: change.path
		});
		const hashes = await provider.blobHashes(specs).catch(() => void 0);
		if (hashes === void 0) return hidden;
		const gapOffset = gapTree === void 0 ? -1 : 0;
		const deletedOffset = deletedTree === void 0 ? -1 : gapTree === void 0 ? 0 : candidates.length;
		candidates.forEach((change, index) => {
			const current = probe.get(change.path);
			if (current === void 0) {
				if (deletedOffset >= 0 && hashes[deletedOffset + index] !== void 0) hidden.add(change.path);
				return;
			}
			if (gapOffset >= 0) {
				const gapBlob = hashes[gapOffset + index];
				if (gapBlob !== void 0 && gapBlob === current) hidden.add(change.path);
			}
		});
		if (hidden.size === 0) return hidden;
		for (let index = changes.length - 1; index >= 0; index -= 1) if (hidden.has(changes[index].path)) changes.splice(index, 1);
		warnings.push(`${hidden.size} file(s) were changed outside a session turn and are not listed: ${summarize([...hidden])}`);
		return hidden;
	}
	/**
	* Drop foreign rows written after the current idle boundary (a completed
	* turn, or a session-end fallback when the close happened inside a turn).
	*
	* The primary boundary is the tree captured at that boundary: a row present
	* there whose current blob differs (including a deletion) was modified after
	* the turn/session ended. A row absent from the tree is ambiguous — `add -A`
	* skips ignored and excluded paths, so it may have existed at the boundary
	* without being recorded — and only the file mtime can prove it appeared
	* later.
	*
	* When no boundary tree exists, the file mtime against the boundary event is
	* the fallback for every candidate; a deleted file has no mtime and stays
	* listed in that case.
	*
	* Only rows already proven foreign are candidates: a path whose content still
	* matches this session's newest tracked post-image stays listed either way.
	* The hidden paths are removed from `changes`; the caller keeps them out of
	* the accepted group so the same path cannot reappear there.
	*/
	async dropAfterBoundaryChanges(provider, changes, probe, boundaryAt, label, boundaryTree, warnings) {
		const candidates = changes.filter((change) => change.foreign === true);
		const hidden = /* @__PURE__ */ new Set();
		if (candidates.length === 0) return hidden;
		const boundaryHashes = boundaryTree === void 0 ? void 0 : await provider.blobHashes(candidates.map((change) => ({
			treeish: boundaryTree,
			path: change.path
		}))).catch(() => void 0);
		if (boundaryTree !== void 0 && boundaryHashes !== void 0) await Promise.all(candidates.map(async (change, index) => {
			const boundaryBlob = boundaryHashes[index];
			if (boundaryBlob === probe.get(change.path)) return;
			if (boundaryBlob !== void 0) {
				hidden.add(change.path);
				return;
			}
			const stat = await fs.promises.stat(change.absolutePath).catch(() => void 0);
			if (stat !== void 0 && stat.mtimeMs > boundaryAt) hidden.add(change.path);
		}));
		else await Promise.all(candidates.map(async (change) => {
			const stat = await fs.promises.stat(change.absolutePath).catch(() => void 0);
			if (stat !== void 0 && stat.mtimeMs > boundaryAt) hidden.add(change.path);
		}));
		if (hidden.size === 0) return hidden;
		for (let index = changes.length - 1; index >= 0; index -= 1) if (hidden.has(changes[index].path)) changes.splice(index, 1);
		warnings.push(`${hidden.size} file(s) were modified after this ${label} ended and are not listed: ${summarize([...hidden])}`);
		return hidden;
	}
	/**
	* Accepted rows: paths whose accepted content differs from the session
	* baseline, i.e. what this session accepted. One diff process; hunks are
	* intentionally omitted (the accepted group is a file list).
	*
	* Suppression is purely path-based: a path that is still pending (it differs
	* from the accepted baseline, so it is already in the unaccepted list) never
	* appears twice. No authorship is inferred — the tracked chain is not
	* authoritative, and guessing wrong would either hide a row or duplicate it.
	*/
	async acceptedRows(provider, sessionBase, accepted, pending, warnings, knownTree) {
		if (sessionBase === void 0) return [];
		const acceptedTree = knownTree ?? await provider.treeOf(accepted).catch(() => void 0);
		if (acceptedTree === void 0) {
			warnings.push("the accepted baseline tree could not be read; already-accepted files are not listed");
			return [];
		}
		if (acceptedTree === sessionBase) return [];
		const entries = await provider.diffEntries(sessionBase, acceptedTree).catch(() => void 0);
		if (entries === void 0) {
			warnings.push("the accepted-file list could not be computed from the snapshot repository");
			return [];
		}
		return entries.filter((entry) => !pending.has(entry.path)).map((entry) => ({
			path: entry.path,
			absolutePath: provider.absolutePath(entry.path),
			status: entry.status === "A" ? "created" : entry.status === "D" ? "deleted" : "modified",
			source: "git",
			restorable: true,
			accepted: true
		}));
	}
	/**
	* Paths present in the newest full-worktree capture but absent from the
	* accepted baseline. These are files created without a write/edit call —
	* typically by a bash script — so no tracked call can stage them; the capture
	* tree can. They are only staged (visibility), never treated as owned: the
	* attribution step still marks them `foreign` and the idle-boundary filter
	* still drops a rewrite that happened after the turn/session ended.
	*
	* A failed comparison only costs these rows (and adds a warning); a stale
	* capture can under-report but never invent a path.
	*/
	async pathsAddedSinceCapture(provider, acceptedTree, cwd, sessionId, known, warnings) {
		const capture = await this.snapshots.latestCapture(cwd, sessionId).catch(() => void 0);
		if (capture === void 0) return [];
		if (acceptedTree === void 0 || acceptedTree === capture.tree) return [];
		const entries = await provider.diffEntries(acceptedTree, capture.tree).catch(() => void 0);
		if (entries === void 0) {
			warnings.push("files created outside the write/edit tool chain could not be discovered from the newest session capture");
			return [];
		}
		return entries.filter((entry) => entry.status === "A").map((entry) => entry.path).filter((rel) => !known.has(rel));
	}
	async nestedRoots(provider) {
		return this.snapshots.nestedRoots(provider.cwd, provider);
	}
	/**
	* Per-call patches of the session chain, with hunks and accept state. A
	* patch is accepted when its post-image blob equals the accepted blob of the
	* same path. The chain only annotates rows; it never scopes the list.
	*
	* The first call on an ignored path has a parent tree that lacks the file
	* (`add -A` skipped it), so its chain patch is a whole-file "added" patch.
	* When the session-start blob is known the patch is recomputed from the
	* baseline tree, which turns it back into the actual modification.
	*/
	async modifications(provider, accepted, calls, baselineTree, preImages) {
		if (calls.length === 0) return [];
		const commits = calls.map((call) => call.commit).filter((commit) => commit !== void 0);
		const patches = commits.length > 0 ? await provider.diffTreePatches(commits, { context: this.options.diffContextLines }).catch(() => /* @__PURE__ */ new Map()) : /* @__PURE__ */ new Map();
		const patched = [...new Set(calls.map((call) => call.path))];
		const acceptedHashes = await provider.blobHashes(patched.map((path) => ({
			treeish: accepted,
			path
		}))).catch(() => new Array(patched.length));
		const acceptedBlobs = /* @__PURE__ */ new Map();
		patched.forEach((rel, index) => acceptedBlobs.set(rel, acceptedHashes[index]));
		const blobs = await this.callBlobs(provider, calls);
		const byPath = /* @__PURE__ */ new Map();
		for (const call of calls) {
			const list = byPath.get(call.path) ?? [];
			list.push(call);
			byPath.set(call.path, list);
		}
		const result = [];
		for (const call of calls) {
			let view = patchFileViews(call.commit === void 0 ? "" : patches.get(call.commit) ?? "", this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile).find((item) => item.path === call.path);
			if (view?.status === "added" && call.commit !== void 0 && baselineTree !== void 0 && preImages?.has(call.path) === true) view = await this.baselinePatch(provider, baselineTree, call.commit, call.path) ?? view;
			const blob = blobs.get(call.callId);
			const acceptedBlob = acceptedBlobs.get(call.path);
			const later = (byPath.get(call.path) ?? []).filter((item) => item.seq > call.seq).map((item) => item.callId);
			result.push({
				modificationId: call.callId,
				toolName: call.toolName === "write" ? "write" : "edit",
				path: call.path,
				turn: call.turn,
				step: call.step,
				seq: call.seq,
				hunks: view?.view ?? [],
				restorable: call.commit === void 0 || call.oversized === true ? "unsupported" : view?.status === "added" ? "file-only" : "merge",
				accepted: acceptedBlob !== void 0 && blob !== void 0 && blob === acceptedBlob,
				...call.superseded === true ? { reason: "the path was rewritten before this call could be recorded" } : {},
				...call.deleted === true ? { reason: "this call removed the file" } : {},
				...view?.status === "added" ? { createdFile: true } : {},
				...later.length > 0 ? { laterModificationIds: later } : {}
			});
		}
		return result.sort((a, b) => a.seq - b.seq || a.turn - b.turn || a.step - b.step);
	}
	async locatePatch(bound, provider, modificationId) {
		const call = (await this.tracker.loadCalls(bound.cwd, bound.sessionId)).find((item) => item.callId === modificationId);
		if (call === void 0) return void 0;
		const patch = await this.callPatch(provider, call, bound.sessionBase, bound.preImages);
		const view = patchFileViews(patch, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile).find((item) => item.path === call.path);
		return {
			call,
			patch,
			...view === void 0 ? {} : { view }
		};
	}
	/**
	* Post-image blob of every call, keyed by `callId`. Blobs already in memory
	* (the common case) are used as-is; the rest — a cold read after a restart
	* leaves `TrackedCall.blob` unset — are resolved in one
	* `cat-file --batch-check` instead of one `rev-parse` per call.
	*/
	async callBlobs(provider, calls) {
		const result = /* @__PURE__ */ new Map();
		const pending = [];
		for (const call of calls) {
			if (call.blob !== void 0) {
				result.set(call.callId, call.blob);
				continue;
			}
			if (call.deleted === true || call.commit === void 0) {
				result.set(call.callId, void 0);
				continue;
			}
			pending.push(call);
		}
		if (pending.length > 0) {
			const hashes = await provider.blobHashes(pending.map((call) => ({
				treeish: call.commit,
				path: call.path
			}))).catch(() => new Array(pending.length));
			pending.forEach((call, index) => result.set(call.callId, hashes[index]));
		}
		return result;
	}
	/**
	* The patch between the session baseline and one call, restricted to its
	* path. Used when the call's chain parent lacks the file (an ignored path):
	* the chain patch would add the whole file while the baseline already holds
	* its session-start content.
	*/
	async baselinePatch(provider, baselineTree, commit, rel) {
		const patch = await this.renderPatch(provider, baselineTree, commit, rel);
		if (patch === "") return void 0;
		return patchFileViews(patch, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile).find((item) => item.path === rel);
	}
	async callPatch(provider, call, baselineTree, preImages) {
		if (call.commit === void 0) return "";
		const result = await provider.run([
			"diff-tree",
			"-p",
			"--no-renames",
			"--full-index",
			`--unified=${this.options.diffContextLines}`,
			`${call.commit}^`,
			call.commit,
			"--",
			call.path
		]);
		if (result.code !== 0) return "";
		if (baselineTree === void 0 || preImages?.has(call.path) !== true) return result.stdout;
		if (patchFileViews(result.stdout, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile).find((item) => item.path === call.path)?.status !== "added") return result.stdout;
		const delta = await this.renderPatch(provider, baselineTree, call.commit, call.path);
		return delta === "" ? result.stdout : delta;
	}
	/** Raw `diff` output for a baseline-to-call patch (kept as text for replay). */
	async renderPatch(provider, baselineTree, commit, rel) {
		const result = await provider.run([
			"diff",
			"--no-renames",
			"--full-index",
			`--unified=${this.options.diffContextLines}`,
			baselineTree,
			commit,
			"--",
			rel
		]);
		return result.code === 0 ? result.stdout : "";
	}
	/**
	* Accepted blob of many paths in one process. `AcceptBase.acceptedBlob`
	* resolves the ref and spawns per path; the accept paths ask for every
	* changed file at once. `known` entries (from the accept that just ran) are
	* reused as-is, and only the paths it did not cover are resolved.
	*/
	async acceptedBlobMap(bound, provider, paths, known) {
		const result = /* @__PURE__ */ new Map();
		const missing = [];
		for (const rel of [...new Set(paths)]) if (known !== void 0 && known.has(rel)) result.set(rel, known.get(rel));
		else missing.push(rel);
		if (missing.length > 0) {
			const commit = await this.accepts.ref(bound.cwd, bound.sessionId);
			const hashes = commit === void 0 ? new Array(missing.length) : await provider.blobHashes(missing.map((path) => ({
				treeish: commit,
				path
			}))).catch(() => new Array(missing.length));
			missing.forEach((rel, index) => result.set(rel, hashes[index]));
		}
		return result;
	}
	async acceptValue(bound, paths, acceptedBlobs) {
		const provider = this.snapshots.providerFor(bound.cwd, bound.sessionId);
		const unique = [...new Set(paths)];
		const accepted = await this.acceptedBlobMap(bound, provider, unique, acceptedBlobs);
		const current = await provider.hashBlobs(unique).catch(() => /* @__PURE__ */ new Map());
		const acceptedFiles = [];
		for (const rel of unique) {
			const acceptedBlob = accepted.get(rel);
			if (acceptedBlob !== void 0 && acceptedBlob === current.get(rel)) acceptedFiles.push(rel);
		}
		return {
			acceptedFiles,
			acceptedModifications: await this.acceptedPatchIds(bound, unique, accepted)
		};
	}
	/**
	* Patch ids whose post-image already equals the accepted content. Pass
	* `acceptedBlobs` (from the accept that just ran) to skip resolving the
	* accepted tree again.
	*/
	async acceptedPatchIds(bound, paths, acceptedBlobs) {
		const provider = this.snapshots.providerFor(bound.cwd, bound.sessionId);
		const unique = [...new Set(paths)];
		const wanted = new Set(unique);
		const accepted = await this.acceptedBlobMap(bound, provider, unique, acceptedBlobs);
		const calls = (await this.tracker.loadCalls(bound.cwd, bound.sessionId)).filter((call) => wanted.has(call.path));
		const blobs = await this.callBlobs(provider, calls);
		const byPath = /* @__PURE__ */ new Map();
		for (const call of calls) {
			const list = byPath.get(call.path) ?? [];
			list.push(call);
			byPath.set(call.path, list);
		}
		const ids = [];
		for (const rel of unique) {
			const acceptedBlob = accepted.get(rel);
			if (acceptedBlob === void 0) continue;
			for (const call of byPath.get(rel) ?? []) if (blobs.get(call.callId) === acceptedBlob) ids.push(call.callId);
		}
		return ids;
	}
};
/** Failure-only result, so control flow narrows without the `ok: true` branch. */
function failure(code, message, fields = {}) {
	return {
		ok: false,
		error: {
			code,
			message,
			...fields
		}
	};
}
function safeRel(provider, input) {
	try {
		return provider.normalizeRelPath(input);
	} catch {
		return;
	}
}
/** Short, bounded path list for a warning message. */
function summarize(paths, max = 3) {
	const shown = paths.slice(0, max).join(", ");
	return paths.length > max ? `${shown}, … (+${paths.length - max})` : shown;
}
/** Attach per-path tool-call patch lists to the file rows. */
function attachToolCalls(changes, modifications) {
	for (const change of changes) {
		const calls = modifications.filter((item) => item.path === change.path);
		if (calls.length === 0) continue;
		change.toolCalls = calls.map((item) => ({
			callId: item.modificationId,
			toolName: item.toolName,
			turn: item.turn,
			step: item.step,
			seq: item.seq,
			hunks: item.hunks
		}));
	}
}
/** The turn the session started at (first `turn/start`). */
function sessionStartTurn(session) {
	return (session.snapshotEvents().find((item) => item.type === "turn/start")?.data)?.turn ?? 0;
}
/** The newest `turn/start` turn, for the progress-capture commit message. */
function currentTurn(session) {
	let turn;
	for (const event of session.snapshotEvents()) if (event.type === "turn/start") turn = event.data.turn;
	return turn;
}
/** Stable key for one turn's start gap. */
function gapKey(sessionId, turn) {
	return `${sessionId}\u0000${turn}`;
}
/**
* The nearest turn boundary before `turn`'s `turn/start`: a completed
* `turn/end`, or undefined when the turn did not follow one (aborted or
* mid-turn close, fork seed, or no earlier turn).
*
* Bookkeeping events between turns — `agent/inbox/spliced` when the next
* message is queued, title generation, persistence receipts — are skipped
* instead of disqualifying the boundary. They do not run a turn, and the
* runtime appends the inbox splice between every `turn/end` and the next
* `turn/start`, so requiring adjacency silently disabled gap recording from
* turn 2 on.
*/
function previousTurnEnd(session, turn) {
	const events = session.snapshotEvents();
	let start = -1;
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event.type === "turn/start" && event.data.turn === turn) {
			start = index;
			break;
		}
	}
	if (start < 0) return void 0;
	for (let index = start - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event.type === "session/end-seed") {
			if (event.data.inherited === true) return void 0;
			continue;
		}
		if (event.type === "turn/start") return void 0;
		if (event.type === "turn/end") return event;
	}
}
function sessionIdleEnd(session) {
	const events = session.snapshotEvents();
	let last = events.length - 1;
	let restored = false;
	while (last >= 0) {
		const event = events[last];
		if (event.type !== "session/end-seed") break;
		if (event.data.inherited === true) return void 0;
		restored = true;
		last -= 1;
	}
	if (last < 0) return void 0;
	const event = events[last];
	if (event.type === "turn/end") return {
		endedAt: event.time,
		turnEnded: true
	};
	if (restored) return {
		endedAt: event.time,
		turnEnded: false
	};
}
//#endregion
//#region lib/types/host/restore.js
var RollbackRestore = class {
	ctx;
	snapshots;
	tracker;
	safety;
	options;
	prepared = /* @__PURE__ */ new Map();
	constructor(ctx, snapshots, tracker, safety, options) {
		this.ctx = ctx;
		this.snapshots = snapshots;
		this.tracker = tracker;
		this.safety = safety;
		this.options = options;
	}
	async prepare(sessionId, messageId) {
		const base = this.prepareBase(sessionId);
		if (!base.ok) return base;
		const resolved = resolveBoundary(base.value.session, messageId);
		if (resolved.failure !== void 0) return fail(resolved.failure.code, resolved.failure.message, resolved.failure);
		return this.prepareWithBoundary(base.value, resolved.boundary, messageId);
	}
	/** Turn-anchored prepare: also serves unfinished (stopped) turns. */
	async prepareTurn(sessionId, turn) {
		const base = this.prepareBase(sessionId);
		if (!base.ok) return base;
		if (!Number.isInteger(turn) || turn < 1) return fail("turn-not-found", `turn ${String(turn)} is not a valid turn number`, { sessionId });
		const resolved = resolveBoundaryForTurn(base.value.session, turn);
		if (resolved.failure !== void 0) return fail(resolved.failure.code, resolved.failure.message, resolved.failure);
		return this.prepareWithBoundary(base.value, resolved.boundary);
	}
	prepareBase(sessionId) {
		const live = this.liveSession(sessionId);
		if (!live.ok) return live;
		const session = live.value;
		const cwd = session.header.cwd;
		if (cwd === void 0) return fail("session-not-live", `session "${sessionId}" has no workspace cwd`);
		return ok({
			session,
			cwd
		});
	}
	async prepareWithBoundary(base, boundary, messageId) {
		const { session, cwd } = base;
		const sessionId = session.id;
		const found = await this.snapshots.find(cwd, sessionId, boundary.targetTurn);
		if (found === void 0) return fail("snapshot-unavailable", `no rollback snapshot is available for turn ${boundary.targetTurn}`, {
			sessionId,
			messageId
		});
		const provider = this.snapshots.providerFor(cwd, base.session.id);
		const gitAvailable = await provider.available();
		if (found.manifest.tree !== void 0 && !await this.snapshots.ensureTreeAvailable(found.manifest, provider)) return fail("snapshot-expired", "the snapshot objects are no longer available (the session store was removed or garbage collected)", {
			sessionId,
			messageId
		});
		const warnings = [...found.degraded ? [`snapshot is from turn ${found.manifest.turn}, before the requested turn ${boundary.targetTurn}`] : []];
		await this.tracker.flush(sessionId).catch(() => void 0);
		const calls = await this.tracker.loadCalls(cwd, sessionId).catch(() => []);
		let preparedTree;
		let changes = [];
		if (found.manifest.tree !== void 0 && gitAvailable) {
			preparedTree = await provider.captureTree();
			const entries = await provider.diffEntries(found.manifest.tree, preparedTree);
			for (const entry of entries) {
				if (entry.oldMode === "160000" || entry.newMode === "160000") {
					warnings.push(entry.oldMode !== "160000" ? `nested git repository "${entry.path}" appeared after the snapshot; it is outside the rollback scope and will not be deleted or restored` : `nested git repository "${entry.path}" is tracked as a gitlink; its internal changes are outside the rollback scope (only tool-written files inside it can be restored)`);
					continue;
				}
				if (entry.status === "A") {
					changes.push({
						path: entry.path,
						absolutePath: provider.absolutePath(entry.path),
						status: "created",
						source: "git",
						restorable: true,
						createdAfterSnapshot: true
					});
					continue;
				}
				const diff = await provider.diffHunks(found.manifest.tree, preparedTree, entry.path);
				changes.push({
					path: entry.path,
					absolutePath: provider.absolutePath(entry.path),
					status: entry.status === "D" ? "deleted" : entry.status === "T" ? "typechange" : diff.binary ? "binary" : "modified",
					source: "git",
					restorable: true,
					...diff.binary ? { binary: true } : {},
					...diff.truncated ? { truncated: true } : {},
					...diff.hunks.length > 0 ? { hunks: diff.hunks } : {}
				});
			}
		} else if (found.manifest.tree !== void 0) warnings.push("the isolated snapshot store is unavailable; only the tracked call chain is available");
		const foreign = await this.attributeChanges(provider, calls, changes).catch(() => []);
		if (foreign.length > 0) warnings.push(`${foreign.length} file(s) were not written by this session's tool calls (another session or an external edit) and are not selected by default: ${summarize(foreign)}`);
		const modifications = await this.buildModifications(found.manifest.turn, provider, calls);
		attachToolCalls(changes, modifications);
		const prepareId = crypto.randomUUID();
		const prepared = {
			prepareId,
			sessionId,
			...messageId === void 0 ? {} : { messageId },
			turn: boundary.targetTurn,
			cwd,
			snapshot: found.manifest,
			degraded: found.degraded,
			boundary,
			...preparedTree === void 0 ? {} : { preparedTree },
			gitAvailable,
			changes,
			modifications,
			warnings: [...new Set(warnings)],
			createdAt: Date.now()
		};
		this.prepared.set(prepareId, prepared);
		return ok({
			prepareId,
			snapshot: this.snapshots.snapshotInfo(found.manifest, found.degraded),
			boundary: boundaryInfo(boundary),
			changes,
			modifications,
			warnings: prepared.warnings
		});
	}
	async execute(request) {
		if (request.confirmed !== true) return fail("rollback-failed", "rollback execution requires confirmed: true");
		const prepared = this.prepared.get(request.prepareId);
		if (prepared === void 0 || prepared.sessionId !== request.sessionId) return fail("workspace-changed", "prepare context is missing or does not match this session; run prepare again", {
			sessionId: request.sessionId,
			...request.messageId === void 0 ? {} : { messageId: request.messageId }
		});
		if (request.messageId !== void 0 && prepared.messageId !== request.messageId) return fail("workspace-changed", "prepare context does not match this message; run prepare again", {
			sessionId: request.sessionId,
			messageId: request.messageId
		});
		if (request.messageId === void 0 && (request.turn === void 0 || prepared.turn !== request.turn)) return fail("workspace-changed", "prepare context does not match this turn; run prepare again", { sessionId: request.sessionId });
		if (request.scope === "modifications" && request.paths !== void 0 && request.paths.length > 0) return fail("rollback-failed", "scope=modifications is mutually exclusive with paths");
		if (request.scope === "files" && request.modificationIds !== void 0 && request.modificationIds.length > 0) return fail("rollback-failed", "scope=files is mutually exclusive with modificationIds");
		const live = this.liveSession(request.sessionId);
		if (!live.ok) return live;
		const session = live.value;
		const provider = this.snapshots.providerFor(prepared.cwd, prepared.sessionId);
		let guardId = "";
		let journalId;
		let guardTree;
		let acquired = false;
		const affected = /* @__PURE__ */ new Set();
		try {
			if (prepared.preparedTree !== void 0) {
				guardTree = await provider.captureTree();
				if (guardTree !== prepared.preparedTree) return fail("workspace-changed", "the workspace changed after prepare; please preview again", {
					sessionId: request.sessionId,
					messageId: request.messageId
				});
			}
			await this.safety.acquire(prepared.cwd);
			acquired = true;
			await this.safety.assertFences(this.ctx, prepared.cwd, provider);
			await this.ctx.sessions.flush(session);
			if (request.scope === "modifications") return await this.executeModifications(prepared, request, provider, affected);
			const selected = await this.selectFilePaths(prepared, request, provider);
			if (!selected.ok) return selected;
			for (const item of selected.value.all) affected.add(item);
			const guard = await this.safety.captureGuard(provider, {
				cwd: prepared.cwd,
				sessionId: prepared.sessionId
			}, selected.value.all);
			guardId = guard.guardId;
			journalId = await this.safety.journalStart(provider, guard, selected.value.all);
			const restored = [];
			const kept = [];
			const deleted = [];
			const skipped = [];
			try {
				const gitRestore = selected.value.git.filter((item) => item.inSnapshot);
				const gitCreated = selected.value.git.filter((item) => !item.inSnapshot);
				const restoreRels = gitRestore.map((item) => item.rel);
				const snapshotTree = prepared.snapshot.tree ?? "";
				await provider.restorePaths(snapshotTree, restoreRels);
				const expected = await provider.blobHashes(restoreRels.map((path) => ({
					treeish: snapshotTree,
					path
				}))).catch(() => new Array(restoreRels.length));
				const actual = await provider.hashBlobs(restoreRels).catch(() => /* @__PURE__ */ new Map());
				for (let index = 0; index < restoreRels.length; index += 1) {
					const rel = restoreRels[index];
					if (expected[index] !== actual.get(rel)) throw new Error(`verification failed for ${rel}`);
					restored.push(rel);
				}
				for (const item of gitCreated) {
					const abs = provider.absolutePath(item.rel);
					if (!fs.existsSync(abs)) {
						skipped.push(item.rel);
						continue;
					}
					if (request.createdPolicy === "delete") {
						fs.rmSync(abs, { force: true });
						deleted.push(item.rel);
					} else kept.push(item.rel);
				}
				await this.safety.journalUpdate(provider, journalId, "completed");
				return ok({
					guardId,
					restored,
					kept,
					deleted,
					skipped,
					...request.scope === "turn" ? prepared.boundary.forkAtSeq !== void 0 ? { forkAnchor: prepared.boundary.forkAtSeq } : {
						restart: true,
						cwd: prepared.cwd
					} : {}
				});
			} catch (error) {
				await this.safety.restoreGuard(provider, guard, selected.value.all).catch(() => void 0);
				await this.safety.journalUpdate(provider, journalId, "rolled-back").catch(() => void 0);
				return fail(error instanceof Error && error.message.startsWith("verification failed") ? "verification-failed" : "rollback-failed", String(error), {
					sessionId: request.sessionId,
					messageId: request.messageId,
					paths: selected.value.all
				});
			}
		} catch (error) {
			return this.executeFailure(error, request, prepared, guardId, journalId, affected);
		} finally {
			if (acquired) await this.safety.release();
		}
	}
	async status(sessionId) {
		const live = this.liveSession(sessionId);
		if (!live.ok) return live;
		const cwd = live.value.header.cwd ?? process.cwd();
		const lock = await this.safety.readLock(cwd);
		return ok({
			journal: await this.safety.listJournals(this.snapshots.providerFor(cwd, sessionId)),
			...lock === void 0 ? {} : { lock }
		});
	}
	async openAt(sessionId, request) {
		const live = this.liveSession(sessionId);
		if (!live.ok) return live;
		const cwd = live.value.header.cwd;
		if (cwd === void 0) return fail("session-not-live", `session "${sessionId}" has no workspace cwd`);
		const provider = this.snapshots.providerFor(cwd, live.value.id);
		let rel;
		try {
			rel = provider.normalizeRelPath(request.path);
		} catch {
			return ok({
				opened: false,
				reason: "invalid-path"
			});
		}
		const abs = provider.absolutePath(rel);
		if (request.line !== void 0 && (!Number.isInteger(request.line) || request.line < 1)) return ok({
			opened: false,
			reason: "invalid-path"
		});
		if (request.endLine !== void 0 && (!Number.isInteger(request.endLine) || request.endLine < 1)) return ok({
			opened: false,
			reason: "invalid-path"
		});
		const bridge = await pickBridgeEndpoint(abs);
		if (bridge === null) return ok({
			opened: false,
			reason: "bridge-unavailable"
		});
		try {
			const url = new URL(bridge.endpoint);
			url.searchParams.set("path", abs);
			if (request.line !== void 0) url.searchParams.set("line", String(request.line));
			if (request.endLine !== void 0) url.searchParams.set("endLine", String(request.endLine));
			if (bridge.token !== void 0 && bridge.token !== "") url.searchParams.set("token", bridge.token);
			if (!(await fetch(url, { signal: AbortSignal.timeout(this.options.spawnTimeoutMs) })).ok) return ok({
				opened: false,
				reason: "bridge-unavailable"
			});
			return ok({ opened: true });
		} catch {
			return ok({
				opened: false,
				reason: "bridge-unavailable"
			});
		}
	}
	liveSession(sessionId) {
		const session = this.ctx.sessions.get(sessionId);
		if (session === void 0) return fail("session-not-found", `session "${sessionId}" is not live`, { sessionId });
		return ok(session);
	}
	async selectFilePaths(prepared, request, provider) {
		const requested = request.scope === "modifications" ? void 0 : request.paths;
		const normalizedRequested = requested?.map((item) => {
			try {
				return provider.normalizeRelPath(item);
			} catch {
				return;
			}
		});
		if (normalizedRequested?.some((item) => item === void 0)) return fail("path-not-in-snapshot", "one or more selected paths are invalid workspace paths", {
			sessionId: request.sessionId,
			messageId: request.messageId,
			paths: request.paths
		});
		const normalized = normalizedRequested ?? [];
		const changes = requested === void 0 ? prepared.changes.filter((change) => change.restorable || request.createdPolicy === "delete") : normalized.flatMap((rel) => {
			if (rel === void 0) return [];
			const change = prepared.changes.find((item) => item.path === rel);
			if (change === void 0) return [];
			return [change];
		});
		if (requested !== void 0 && normalizedRequested !== void 0) {
			const missing = normalized.filter((rel, index) => rel !== void 0 && prepared.changes.every((item) => item.path !== rel));
			const rawMissing = missing.map((rel) => requested[normalized.indexOf(rel)] ?? rel);
			if (missing.length > 0) return fail("path-not-in-snapshot", "selected paths are not part of the prepared changes", {
				sessionId: request.sessionId,
				messageId: request.messageId,
				paths: rawMissing
			});
		}
		const all = [];
		const git = [];
		for (const change of changes) {
			const rel = change.path;
			all.push(rel);
			let inSnapshot = false;
			if (prepared.snapshot.tree !== void 0) inSnapshot = (await provider.pathsInTree(prepared.snapshot.tree, rel)).includes(rel);
			git.push({
				rel,
				inSnapshot
			});
		}
		return ok({
			all,
			git
		});
	}
	/**
	* Attribute every previewed change to this session's tool-call chain and flag
	* the rest as `foreign` (see `foreignPaths`).
	*/
	async attributeChanges(provider, calls, changes) {
		if (changes.length === 0) return [];
		const foreign = await foreignPaths(provider, calls, changes.map((change) => change.path));
		const paths = [];
		for (const change of changes) {
			if (!foreign.has(change.path)) continue;
			change.foreign = true;
			paths.push(change.path);
		}
		return paths;
	}
	/** Per-call patches of one turn, read from the tracked commit chain. */
	async buildModifications(turn, provider, tracked) {
		const calls = tracked.filter((call) => call.turn === turn);
		if (calls.length === 0) return [];
		const commits = calls.map((call) => call.commit).filter((commit) => commit !== void 0);
		const patches = commits.length > 0 ? await provider.diffTreePatches(commits, { context: 3 }).catch(() => /* @__PURE__ */ new Map()) : /* @__PURE__ */ new Map();
		const result = [];
		for (const call of calls) {
			const view = patchFileViews(call.commit === void 0 ? "" : patches.get(call.commit) ?? "", this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile).find((item) => item.path === call.path);
			result.push({
				modificationId: call.callId,
				toolName: call.toolName === "write" ? "write" : "edit",
				path: call.path,
				turn: call.turn,
				step: call.step,
				seq: call.seq,
				hunks: view?.view ?? [],
				restorable: call.commit === void 0 || call.oversized === true ? "unsupported" : view?.status === "added" ? "file-only" : "merge",
				...view?.status === "added" ? { createdFile: true } : {}
			});
		}
		return result.sort((a, b) => a.seq - b.seq || a.turn - b.turn || a.step - b.step);
	}
	/**
	* `scope='modifications'`: rebuild each affected file as "turn-start state +
	* every call of the turn except the selected ones", applied forward in call
	* order (docs/git-only-plan.md §2.7).
	*/
	async executeModifications(prepared, request, provider, affected) {
		const ids = request.modificationIds ?? [];
		if (ids.length === 0) return fail("rollback-failed", "scope=modifications requires modificationIds");
		const calls = await this.tracker.loadCalls(prepared.cwd, request.sessionId);
		const selected = new Set(ids);
		if (!calls.some((call) => selected.has(call.callId))) return fail("rollback-failed", "none of the requested modifications are available", {
			sessionId: request.sessionId,
			messageId: request.messageId
		});
		const byPath = /* @__PURE__ */ new Map();
		for (const call of calls) {
			if (call.turn !== prepared.snapshot.turn || call.commit === void 0) continue;
			const list = byPath.get(call.path) ?? [];
			list.push(call);
			byPath.set(call.path, list);
		}
		const paths = [...byPath.entries()].filter(([, chain]) => chain.some((call) => selected.has(call.callId))).map(([rel]) => rel);
		if (paths.length === 0) return fail("rollback-failed", "none of the requested modifications belong to this turn", {
			sessionId: request.sessionId,
			messageId: request.messageId
		});
		for (const rel of paths) affected.add(rel);
		const guard = await this.safety.captureGuard(provider, {
			cwd: prepared.cwd,
			sessionId: prepared.sessionId
		}, paths);
		const journalId = await this.safety.journalStart(provider, guard, paths);
		const results = [];
		const restoredPaths = [];
		const failedPaths = [];
		try {
			await provider.withScratch(async (scratch) => {
				for (const rel of paths) {
					const chain = (byPath.get(rel) ?? []).slice().sort((a, b) => a.seq - b.seq);
					const steps = [];
					const skips = /* @__PURE__ */ new Set();
					for (let index = 0; index < chain.length; index += 1) {
						const call = chain[index];
						steps.push({
							path: rel,
							patch: await this.callPatch(provider, call)
						});
						if (selected.has(call.callId)) skips.add(index);
					}
					const replay = await replayPatches(provider, scratch, `${chain[0].commit}^`, steps, skips);
					for (const call of chain) {
						const isSelected = selected.has(call.callId);
						results.push({
							modificationId: call.callId,
							path: rel,
							status: !isSelected ? "restored" : replay.ok ? "restored" : "conflict",
							...replay.ok || !isSelected || replay.reason === void 0 ? {} : { detail: replay.reason }
						});
					}
					if (replay.ok) restoredPaths.push(rel);
					else failedPaths.push(rel);
				}
			});
			if (failedPaths.length > 0) {
				await this.safety.restoreGuard(provider, guard, failedPaths).catch(() => void 0);
				await this.safety.journalUpdate(provider, journalId, "rolled-back");
				return ok({
					guardId: guard.guardId,
					restored: restoredPaths,
					kept: [],
					deleted: [],
					skipped: failedPaths,
					modificationResults: results
				});
			}
			await this.safety.journalUpdate(provider, journalId, "completed");
			return ok({
				guardId: guard.guardId,
				restored: restoredPaths,
				kept: [],
				deleted: [],
				skipped: [],
				modificationResults: results,
				...request.scope === "turn" ? prepared.boundary.forkAtSeq !== void 0 ? { forkAnchor: prepared.boundary.forkAtSeq } : {
					restart: true,
					cwd: prepared.cwd
				} : {}
			});
		} catch (error) {
			await this.safety.restoreGuard(provider, guard, paths).catch(() => void 0);
			await this.safety.journalUpdate(provider, journalId, "rolled-back").catch(() => void 0);
			return fail("rollback-failed", String(error), {
				sessionId: request.sessionId,
				messageId: request.messageId,
				paths
			});
		}
	}
	/** One call's forward patch (`<commit>^` → `<commit>`), path-limited. */
	async callPatch(provider, call) {
		if (call.commit === void 0) return "";
		const result = await provider.run([
			"diff-tree",
			"-p",
			"--no-renames",
			"--full-index",
			"--unified=3",
			`${call.commit}^`,
			call.commit,
			"--",
			call.path
		]);
		return result.code === 0 ? result.stdout : "";
	}
	async executeFailure(error, request, prepared, guardId, journalId, affected) {
		const message = error instanceof Error ? error.message : String(error);
		const code = message.includes("workspace lock timeout") ? "lock-timeout" : message.includes("running agent") ? "agent-running" : message.includes("git operation") ? "git-operation-in-progress" : "rollback-failed";
		let guardRolledBack = guardId === "";
		if (guardId !== "" && affected.size > 0) try {
			const provider = this.snapshots.providerFor(prepared.cwd, prepared.sessionId);
			const guard = await this.safety.loadGuard(provider, guardId);
			if (guard !== void 0) await this.safety.restoreGuard(provider, guard, [...affected]);
			guardRolledBack = true;
		} catch {}
		if (journalId !== void 0) {
			const provider = this.snapshots.providerFor(prepared.cwd, prepared.sessionId);
			await this.safety.journalUpdate(provider, journalId, guardRolledBack ? "rolled-back" : "interrupted").catch(() => void 0);
		}
		return fail(code, message, {
			sessionId: request.sessionId,
			messageId: request.messageId,
			paths: [...affected]
		});
	}
	finishGuard(_prepared, _guardId, _journalId) {}
};
async function pickBridgeEndpoint(abs) {
	const bridgesFile = process.env.DSHUI_BRIDGES_FILE;
	let best = null;
	if (bridgesFile !== void 0 && bridgesFile !== "") try {
		const parsed = JSON.parse(fs.readFileSync(bridgesFile, "utf8"));
		for (const entry of Object.values(parsed)) {
			if (typeof entry.pid !== "number" || !isAlive$1(entry.pid)) continue;
			if (typeof entry.workspace !== "string" || entry.workspace === "" || typeof entry.endpoint !== "string" || entry.endpoint === "") continue;
			const prefix = entry.workspace.endsWith(path.sep) ? entry.workspace : `${entry.workspace}${path.sep}`;
			if (abs !== entry.workspace && !abs.startsWith(prefix)) continue;
			if (best === null || entry.workspace.length > best.workspace.length) best = {
				workspace: entry.workspace,
				endpoint: entry.endpoint,
				...typeof entry.token === "string" && entry.token !== "" ? { token: entry.token } : {}
			};
		}
	} catch {}
	if (best !== null) return {
		endpoint: best.endpoint,
		...best.token === void 0 ? {} : { token: best.token }
	};
	const endpoint = process.env.DSHUI_OPEN_ENDPOINT;
	if (endpoint === void 0 || endpoint === "") return null;
	const token = process.env.DSHUI_OPEN_TOKEN;
	return {
		endpoint,
		...token === void 0 || token === "" ? {} : { token }
	};
}
function isAlive$1(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === "EPERM";
	}
}
//#endregion
//#region lib/types/host/snapshot.js
/**
* Encode an arbitrary string as one filesystem-safe path segment, mirroring
* the JSONL session persistence layout (`@deepseek-ai/dsh-session-persistence-jsonl`):
* safe code units stay literal, everything else becomes `~XXXX`.
*/
function encodeSessionSegment(raw) {
	if (raw === ".") return "~002E";
	if (raw === "..") return "~002E~002E";
	let out = "";
	for (let i = 0; i < raw.length; i += 1) {
		const code = raw.charCodeAt(i);
		const ch = String.fromCharCode(code);
		if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) out += ch;
		else out += `~${code.toString(16).toUpperCase().padStart(4, "0")}`;
	}
	return out;
}
/**
* The readable per-project directory key, mirroring the JSONL persistence
* layout: separators become `-`, unsafe units `~XXXX`, bounded and wrapped
* in `--…--`.
*/
function projectDirKey(cwd) {
	let readable = "";
	let separatorRun = false;
	for (let i = 0; i < cwd.length; i += 1) {
		const code = cwd.charCodeAt(i);
		const ch = String.fromCharCode(code);
		if (ch === "/" || ch === "\\" || ch === ":") {
			if (!separatorRun) readable += "-";
			separatorRun = true;
		} else if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
			readable += ch;
			separatorRun = false;
		} else {
			readable += `~${code.toString(16).toUpperCase().padStart(4, "0")}`;
			separatorRun = false;
		}
	}
	return `--${(readable.replace(/^-+/, "") || "root").slice(0, 251)}--`;
}
/**
* The on-disk directory DSH owns for one session, mirroring the JSONL
* persistence backend: `<DSH_HOME>/sessions/<projectKey(cwd)>/<sessionId>`.
* Session-local artifacts placed here are removed together with the session.
*/
function sessionDirFor(dshHome, cwd, sessionId) {
	const project = cwd === void 0 || cwd === "" ? "_no-cwd" : projectDirKey(cwd);
	return path.join(dshHome, "sessions", project, encodeSessionSegment(sessionId));
}
/** The isolated bare snapshot repo for one session, inside its session dir. */
function sessionSnapshotRepo(dshHome, cwd, sessionId) {
	return path.join(sessionDirFor(dshHome, cwd, sessionId), "rollback.git");
}
function resolveDshHome() {
	const configured = process.env.DSH_HOME;
	return configured !== void 0 && configured !== "" ? configured : path.join(os.homedir(), ".dsh");
}
function changeLedgerRoot() {
	return path.join(resolveDshHome(), "change-ledger");
}
function manifestsPath() {
	return path.join(changeLedgerRoot(), "v1", "manifests.json");
}
function journalsPath() {
	return path.join(changeLedgerRoot(), "v1", "journals.json");
}
function locksDir() {
	return path.join(changeLedgerRoot(), "locks");
}
async function readJsonFile(file, fallback) {
	try {
		const raw = await fs.promises.readFile(file, "utf8");
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}
async function writeJsonFileAtomic(file, value) {
	await fs.promises.mkdir(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
	await fs.promises.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
	await fs.promises.rename(tmp, file);
}
const POINTS_PREFIX = "refs/dsh/points/";
/**
* `refs/dsh/end`: worktree tree captured when the session is disposed. It is
* the boundary between changes made during the session and changes made after
* it, not a rollback target (the last turn point still predates the last
* turn's writes, so it cannot serve that purpose).
*/
const SESSION_END_REF = "refs/dsh/end";
/**
* `refs/dsh/turn-end`: worktree tree captured immediately after a `turn/end`.
* It is the per-turn boundary used to tell changes made while the turn was
* running (part of the session) from changes made after it ended. Only the
* latest turn is kept; each completed turn replaces it.
*/
const TURN_END_REF = "refs/dsh/turn-end";
/**
* `refs/dsh/progress`: on-demand full-worktree capture taken while a turn is
* running (the modification dock's refresh button). It is **not** a boundary:
* the modification list uses it as the newest capture so files created by a
* bash script mid-turn become visible immediately, instead of waiting for the
* next `turn/end`. Only the latest capture is kept.
*/
const PROGRESS_REF = "refs/dsh/progress";
/**
* `refs/dsh/gap`: cumulative tree of paths whose current content was last
* changed outside any turn (between two turns, or while the session was
* closed). `refs/dsh/gap-deleted` records paths whose last gap change was a
* deletion (presence only; blob content is the pre-deletion object).
*
* The gap trees are updated at every turn start by diffing the previous
* turn-end tree against the new turn-start tree. They let the modification
* list exclude changes that happened while no turn was running, without a
* per-path replay over every historic snapshot.
*/
const GAP_REF = "refs/dsh/gap";
const GAP_DELETED_REF = "refs/dsh/gap-deleted";
/**
* Turn-start rollback points, stored as git commits
* (docs/git-only-plan.md §2.1).
*
* `refs/dsh/points/<nnnn>` is a full-worktree commit taken at the start of a
* turn; everything the old manifest store kept (snapshot ids, JSON files, the
* storage-domain table) is now a ref. The full `add -A` is the only
* O(worktree) operation left, and it reuses a persistent index so unchanged
* files are not re-hashed.
*/
var SnapshotManager = class {
	options;
	ctx;
	/** In-memory manifests for the current process (never persisted). */
	manifests = /* @__PURE__ */ new Map();
	/** Nested-repository roots per workspace cwd, refreshed by `capture`. */
	nestedRootsCache = /* @__PURE__ */ new Map();
	dshHome;
	/** In-flight isolated repo inits, keyed by repo dir (dedupe across providers). */
	isolatedInit = /* @__PURE__ */ new Map();
	/**
	* Per-session capture serialization. Turn-start, turn-end and session-end
	* captures all reuse the provider's persistent scan index, so overlapping
	* runs would interleave `add -A`/`write-tree` on one index file.
	*/
	captureQueues = /* @__PURE__ */ new Map();
	constructor(options, ctx) {
		this.options = options;
		this.ctx = ctx;
		this.dshHome = options.dshHome ?? resolveDshHome();
	}
	get ledgerDir() {
		return this.options.ledgerDir;
	}
	/**
	* Run `run` after any capture already queued for this session. A failed
	* predecessor never blocks the next capture; the queue entry is dropped once
	* the chain drains.
	*/
	queueCapture(cwd, sessionId, run) {
		const key = `${cwd}\0${sessionId}`;
		const current = (this.captureQueues.get(key) ?? Promise.resolve()).then(run, run);
		this.captureQueues.set(key, current);
		const settle = () => {
			if (this.captureQueues.get(key) === current) this.captureQueues.delete(key);
		};
		current.then(settle, settle);
		return current;
	}
	/**
	* Provider bound to one session's isolated snapshot repo (kept inside the
	* session's own directory, so deleting the session removes the objects).
	*/
	providerFor(cwd, sessionId) {
		const isolatedRepoDir = sessionId === void 0 || sessionId === "" ? void 0 : sessionSnapshotRepo(this.dshHome, cwd, sessionId);
		const isolatedRepoInit = isolatedRepoDir === void 0 ? void 0 : this.ensureIsolatedRepo(isolatedRepoDir);
		return new GitProvider(cwd, {
			spawnTimeoutMs: this.options.spawnTimeoutMs,
			maxDiffHunksPerFile: this.options.maxDiffHunksPerFile,
			maxDiffBytesPerFile: this.options.maxDiffBytesPerFile,
			restoreChunkSize: this.options.restoreChunkSize,
			isolatedRepoDir,
			isolatedRepoInit
		});
	}
	ensureIsolatedRepo(dir) {
		const existing = this.isolatedInit.get(dir);
		if (existing !== void 0) return existing;
		const init = spawnGit(process.cwd(), [
			"init",
			"--bare",
			"--quiet",
			dir
		], process.env, this.options.spawnTimeoutMs).then((result) => result.code === 0).catch(() => false);
		this.isolatedInit.set(dir, init);
		init.then((ok) => {
			if (!ok) this.isolatedInit.delete(dir);
		});
		return init;
	}
	/**
	* Workspace-relative roots of the nested git repositories under `cwd`.
	*
	* Discovery costs a full `readdir` + per-directory `lstat` walk of the
	* workspace (seconds on a large checkout), so the result is cached per cwd
	* and refreshed by every turn `capture`, which already discovers nested
	* repositories while materializing the snapshot. Callers on the list path
	* must never pay that walk per refresh.
	*/
	async nestedRoots(cwd, provider) {
		const cached = this.nestedRootsCache.get(cwd);
		if (cached !== void 0) return cached;
		const roots = (await provider.listNestedRepos().catch(() => [])).map((repo) => repo.rel).filter((rel) => rel !== "");
		this.nestedRootsCache.set(cwd, roots);
		return roots;
	}
	/** Capture the turn-start point. Failures never block the agent. */
	async capture(session, turn) {
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		return this.queueCapture(cwd, session.id, () => this.capturePoint(session, turn));
	}
	async capturePoint(session, turn) {
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		const provider = this.providerFor(cwd, session.id);
		if (!await provider.available().catch(() => false)) return void 0;
		const ref = pointRef(turn);
		if (await provider.readRef(ref) !== void 0) return this.manifestAt(cwd, session.id, turn, provider);
		const captured = await provider.captureTreeInfo().catch(() => void 0);
		const tree = captured?.tree;
		const materialized = captured?.materialized ?? false;
		if (tree === void 0) return void 0;
		if (captured?.nested === void 0) this.nestedRootsCache.delete(cwd);
		else this.nestedRootsCache.set(cwd, captured.nested);
		const message = [
			"turn point",
			`session=${session.id}`,
			`turn=${turn}`,
			`cwd=${cwd}`,
			`created=${Date.now()}`,
			""
		].join("\n");
		const commit = await provider.commitTree(tree, [], message);
		if (!await provider.updateRef(ref, commit)) return void 0;
		await this.prune(cwd, session.id, provider);
		const manifest = {
			snapshotId: `${session.id}:${turn}:${commit.slice(0, 8)}`,
			sessionId: session.id,
			turn,
			cwd,
			tree,
			createdAt: Date.now(),
			mode: "git",
			...materialized ? { materialized: true } : {}
		};
		const list = this.manifests.get(session.id) ?? [];
		this.manifests.set(session.id, [...list.filter((item) => item.turn !== turn), manifest]);
		return manifest;
	}
	/**
	* Capture the worktree at session disposal into {@link SESSION_END_REF}.
	*
	* A turn point is taken at turn *start*, so the newest point of a session
	* predates its last turn's writes and cannot mark the session's end. This is
	* the fallback end boundary for a close that happened inside a turn (or
	* before any turn ended); a normal turn end records {@link TURN_END_REF}
	* instead, which is stricter about changes made after the last turn.
	*/
	async captureEnd(session) {
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		return this.queueCapture(cwd, session.id, () => this.captureBoundary(session, SESSION_END_REF, "session end"));
	}
	/**
	* Capture the worktree immediately after `turn/end` into {@link TURN_END_REF}.
	* This is the per-turn boundary: changes made after the turn are excluded
	* while the session stays idle, while everything the turn itself produced
	* stays in the list.
	*/
	async captureTurnEnd(session, turn) {
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		return this.queueCapture(cwd, session.id, () => this.captureBoundary(session, TURN_END_REF, "turn end", turn));
	}
	/**
	* Capture the worktree on demand into {@link PROGRESS_REF}. Called by the
	* explicit refresh action while a turn is running: it closes the window in
	* which a bash-created file exists but no capture has recorded it yet. The
	* capture is serialized with turn-start/turn-end captures, so it can never
	* interleave with them on the persistent scan index.
	*/
	async captureProgress(session, turn) {
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		return this.queueCapture(cwd, session.id, () => this.captureBoundary(session, PROGRESS_REF, "progress", turn));
	}
	async captureBoundary(session, ref, label, turn) {
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		const provider = this.providerFor(cwd, session.id);
		if (!await provider.available().catch(() => false)) return void 0;
		const captured = await provider.captureTreeInfo().catch(() => void 0);
		const tree = captured?.tree;
		if (tree === void 0) return void 0;
		if (captured?.nested === void 0) this.nestedRootsCache.delete(cwd);
		else this.nestedRootsCache.set(cwd, captured.nested);
		const message = [
			label,
			`session=${session.id}`,
			...turn === void 0 ? [] : [`turn=${turn}`],
			`cwd=${cwd}`,
			`created=${Date.now()}`,
			""
		].join("\n");
		const commit = await provider.commitTree(tree, [], message);
		if (!await provider.updateRef(ref, commit)) return void 0;
		return tree;
	}
	/** Tree and capture time of the last session-end boundary, if one exists. */
	async endBoundary(cwd, sessionId) {
		return this.refBoundary(cwd, sessionId, SESSION_END_REF);
	}
	/** Tree and capture time of the latest turn-end boundary, if one exists. */
	async turnEndBoundary(cwd, sessionId) {
		return this.refBoundary(cwd, sessionId, TURN_END_REF);
	}
	/**
	* The newest full-worktree capture of this session: a turn point, the
	* turn-end boundary, the session-end boundary or an on-demand progress
	* capture. All four are `add -A` trees (they honor .gitignore), so a path
	* they contain was present in the worktree at capture time no matter who
	* created it.
	*
	* The modification list uses this tree to discover files created by bash or
	* another external process: such a path has no write/edit call, so staging it
	* from the capture is the only way to make it appear in `git diff
	* <accepted>` (git never lists an untracked path). It is a visibility aid,
	* not a boundary: post-turn filtering still compares against
	* {@link turnEndBoundary} / {@link endBoundary} only.
	*
	* Commit times have second resolution, while two captures (a turn point and a
	* progress capture, say) can share one second; the capture commit message
	* records `created=<ms>`, so use it to order them precisely.
	*/
	async latestCapture(cwd, sessionId) {
		const provider = this.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return void 0;
		const entries = await provider.listRefsWithMeta("refs/dsh/").catch(() => []);
		let latest;
		for (const entry of entries) {
			if (entry.tree === "") continue;
			if (entry.ref !== "refs/dsh/turn-end" && entry.ref !== "refs/dsh/end" && entry.ref !== "refs/dsh/progress" && !entry.ref.startsWith("refs/dsh/points/")) continue;
			const recorded = /(?:^|\n)created=(\d+)/.exec(entry.contents);
			const precise = recorded === null ? NaN : Number(recorded[1]);
			const createdAt = Number.isFinite(precise) && precise > 0 ? precise : entry.createdAt * 1e3;
			if (createdAt <= 0) continue;
			if (latest === void 0 || createdAt > latest.createdAt) latest = {
				ref: entry.ref,
				tree: entry.tree,
				createdAt
			};
		}
		return latest;
	}
	/** Wait for every capture queued for this session (turn start/end, gaps). */
	async waitForCaptures(cwd, sessionId) {
		await this.captureQueues.get(`${cwd}\0${sessionId}`)?.catch(() => void 0);
	}
	/**
	* Record the changes made between the previous turn's end and this turn's
	* start into the cumulative gap trees.
	*
	* `boundaryAt` is the previous `turn/end` event time; a stale turn-end ref
	* (its capture time is older than that event) is not used. Entries touching a
	* gitlink are skipped because their objects are not worktree blobs. The two
	* trees are cumulative: a path updated here leaves the other tree.
	*/
	async recordGap(session, turn, startTree, boundaryAt) {
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return;
		await this.queueCapture(cwd, session.id, () => this.recordGapNow(session, turn, startTree, boundaryAt));
	}
	async recordGapNow(session, turn, startTree, boundaryAt) {
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return;
		const provider = this.providerFor(cwd, session.id);
		if (!await provider.available().catch(() => false)) return;
		const boundary = await this.refBoundary(cwd, session.id, TURN_END_REF);
		if (boundary === void 0 || boundary.createdAt + 1e3 < boundaryAt) return;
		if (boundary.tree === startTree) return;
		const entries = await provider.diffEntries(boundary.tree, startTree).catch(() => void 0);
		if (entries === void 0) return;
		const effective = entries.filter((entry) => entry.newMode !== "160000" && entry.oldMode !== "160000");
		if (effective.length === 0) return;
		const gapTree = await this.treeForRef(provider, GAP_REF);
		const deletedTree = await this.treeForRef(provider, GAP_DELETED_REF);
		const gapAdd = effective.filter((entry) => entry.status !== "D").map((entry) => ({
			path: entry.path,
			blob: entry.newHash,
			mode: entry.newMode
		}));
		const gapRemove = effective.filter((entry) => entry.status === "D").map((entry) => ({ path: entry.path }));
		const deletedAdd = effective.filter((entry) => entry.status === "D").map((entry) => ({
			path: entry.path,
			blob: entry.oldHash,
			mode: entry.oldMode
		}));
		const deletedRemove = effective.filter((entry) => entry.status !== "D").map((entry) => ({ path: entry.path }));
		const nextGap = await provider.withScratch(async (scratch) => {
			if (gapTree !== void 0) await provider.readTree(scratch, gapTree);
			await provider.updateIndexInfo(scratch, [...gapAdd, ...gapRemove]);
			return provider.writeTree(scratch);
		});
		const nextDeleted = await provider.withScratch(async (scratch) => {
			if (deletedTree !== void 0) await provider.readTree(scratch, deletedTree);
			await provider.updateIndexInfo(scratch, [...deletedAdd, ...deletedRemove]);
			return provider.writeTree(scratch);
		});
		const createdAt = Date.now();
		const message = [
			"gap changes",
			`session=${session.id}`,
			`turn=${turn}`,
			`cwd=${cwd}`,
			`created=${createdAt}`,
			""
		].join("\n");
		if (nextGap !== gapTree) {
			const commit = await provider.commitTree(nextGap, [], message);
			await provider.updateRef(GAP_REF, commit);
		}
		if (nextDeleted !== deletedTree) {
			const commit = await provider.commitTree(nextDeleted, [], message);
			await provider.updateRef(GAP_DELETED_REF, commit);
		}
	}
	/** Cumulative gap trees for this session, if any gap was recorded. */
	async gapState(cwd, sessionId) {
		const provider = this.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return {};
		const entries = await provider.listRefsWithMeta("refs/dsh/gap*").catch(() => []);
		const result = {};
		for (const entry of entries) {
			if (entry.tree === "") continue;
			if (entry.ref === "refs/dsh/gap") result.gapTree = entry.tree;
			else if (entry.ref === "refs/dsh/gap-deleted") result.deletedTree = entry.tree;
		}
		return result;
	}
	async treeForRef(provider, ref) {
		const commit = await provider.readRef(ref).catch(() => void 0);
		if (commit === void 0) return void 0;
		return provider.treeOf(commit).catch(() => void 0);
	}
	/**
	* The capture time lets a reader reject a boundary left behind by an earlier
	* lifecycle when the latest capture failed (a stale tree would misclassify
	* changes that happened in between).
	*/
	async refBoundary(cwd, sessionId, ref) {
		const provider = this.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return void 0;
		const entry = (await provider.listRefsWithMeta(ref).catch(() => [])).find((item) => item.ref === ref);
		if (entry === void 0 || entry.tree === "" || entry.createdAt <= 0) return void 0;
		return {
			tree: entry.tree,
			createdAt: entry.createdAt * 1e3
		};
	}
	/** Whether this session ever created an isolated snapshot repository. */
	hasRepository(cwd, sessionId) {
		return fs.existsSync(sessionSnapshotRepo(this.dshHome, cwd, sessionId));
	}
	/**
	* The exact turn-start point of one turn, without the earlier-point
	* fallback `find` applies. The modification list must bound a gap with the
	* very snapshot taken at that turn's start, never with an older point.
	*/
	async findExact(cwd, sessionId, turn) {
		const provider = this.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return void 0;
		return this.manifestAt(cwd, sessionId, turn, provider);
	}
	/** Exact point first, then the newest earlier point for the same session. */
	async find(cwd, sessionId, targetTurn) {
		const provider = this.providerFor(cwd, sessionId);
		if (!await provider.available().catch(() => false)) return void 0;
		const exact = await this.manifestAt(cwd, sessionId, targetTurn, provider);
		if (exact !== void 0) return {
			manifest: exact,
			degraded: false
		};
		const earlier = (await this.listPoints(cwd, sessionId, provider)).filter((item) => item.turn < targetTurn).sort((a, b) => b.turn - a.turn)[0];
		if (earlier === void 0) return void 0;
		return {
			manifest: earlier,
			degraded: true
		};
	}
	async listPoints(cwd, sessionId, provider = this.providerFor(cwd, sessionId)) {
		return (await provider.listRefsWithMeta(POINTS_PREFIX).catch(() => [])).map((entry) => {
			const turn = Number(entry.ref.slice(16)) || 0;
			return {
				snapshotId: `${sessionId}:${turn}:${entry.sha.slice(0, 8)}`,
				sessionId,
				turn,
				cwd,
				...entry.tree === "" ? {} : { tree: entry.tree },
				createdAt: entry.createdAt > 0 ? entry.createdAt * 1e3 : Date.now(),
				mode: "git"
			};
		}).sort((a, b) => a.turn - b.turn);
	}
	async ensureTreeAvailable(manifest, provider) {
		if (manifest.tree === void 0) return true;
		return provider.treeExists(manifest.tree);
	}
	snapshotInfo(manifest, degraded) {
		return {
			id: manifest.snapshotId,
			turn: manifest.turn,
			createdAt: manifest.createdAt,
			...degraded ? { degraded: true } : {}
		};
	}
	/** Drop the oldest points beyond `maxSnapshotsPerSession`. */
	async prune(cwd, sessionId, provider) {
		const points = await this.listPoints(cwd, sessionId, provider);
		const overflow = points.length - Math.max(1, this.options.maxSnapshotsPerSession);
		if (overflow <= 0) return;
		await provider.deleteRefs(points.slice(0, overflow).map((item) => pointRef(item.turn)));
	}
	async manifestAt(cwd, sessionId, turn, provider) {
		const commit = await provider.readRef(pointRef(turn));
		if (commit === void 0) return void 0;
		const tree = await provider.treeOf(commit).catch(() => void 0);
		return {
			snapshotId: `${sessionId}:${turn}:${commit.slice(0, 8)}`,
			sessionId,
			turn,
			cwd,
			...tree === void 0 ? {} : { tree },
			createdAt: Date.now(),
			mode: "git"
		};
	}
};
/** `refs/dsh/points/<nnnn>`: zero padded so ref order equals turn order. */
function pointRef(turn) {
	return `${POINTS_PREFIX}${String(Math.max(0, Math.trunc(turn))).padStart(4, "0")}`;
}
//#endregion
//#region lib/types/host/safety.js
const GUARDS_PREFIX = "refs/dsh/guards/";
const JOURNALS_PREFIX = "refs/dsh/journals/";
var RollbackSafety = class {
	options;
	lock;
	lockFile;
	constructor(options) {
		this.options = options;
	}
	hashWorkspace(cwd) {
		return crypto.createHash("sha256").update(path.resolve(cwd)).digest("hex").slice(0, 24);
	}
	async acquire(cwd) {
		if (this.lock !== void 0) return;
		const file = path.join(locksDir(), `${this.hashWorkspace(cwd)}.lock`);
		const nonce = crypto.randomUUID();
		const deadline = Date.now() + this.options.lockTimeoutMs;
		for (;;) try {
			fs.mkdirSync(locksDir(), { recursive: true });
			const fd = fs.openSync(file, "wx");
			const lock = {
				ownerPid: process.pid,
				nonce,
				createdAt: Date.now()
			};
			fs.writeFileSync(fd, JSON.stringify(lock));
			fs.closeSync(fd);
			this.lock = lock;
			this.lockFile = file;
			return;
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			if (await this.isStale(file)) {
				fs.rmSync(file, { force: true });
				continue;
			}
			if (Date.now() >= deadline) throw new Error(`rollback workspace lock timeout: ${file}`);
			await delay(40);
		}
	}
	async release() {
		if (this.lockFile === void 0) return;
		try {
			if (this.lock !== void 0 && readLock(this.lockFile)?.nonce === this.lock.nonce) fs.rmSync(this.lockFile, { force: true });
		} finally {
			this.lock = void 0;
			this.lockFile = void 0;
		}
	}
	async readLock(cwd) {
		return readLock(path.join(locksDir(), `${this.hashWorkspace(cwd)}.lock`));
	}
	async assertFences(ctx, cwd, provider) {
		if (ctx.agents.list().find((agent) => {
			if (agent.status !== "running") return false;
			return agent.session.header.cwd !== void 0 && path.resolve(agent.session.header.cwd) === path.resolve(cwd);
		}) !== void 0) throw new Error("a running agent shares this workspace; wait for it to become idle");
		if (await provider.assertNoGitOperation()) throw new Error("a git operation (merge/rebase/cherry-pick/…) is in progress");
	}
	/**
	* Guard the pre-rollback content of `paths` as a git commit, so a failed
	* rollback can be undone with a plain forward restore.
	*/
	async captureGuard(provider, context, paths) {
		const unique = [...new Set(paths.map((item) => provider.normalizeRelPath(item)))];
		const head = await provider.readRef(CHAIN_HEAD_REF);
		const blobs = await provider.hashBlobs(unique, { write: true });
		const entries = unique.map((rel) => {
			const blob = blobs.get(rel);
			return blob === void 0 ? { path: rel } : {
				path: rel,
				blob
			};
		});
		const tree = await provider.withScratch(async (scratch) => {
			await provider.readTree(scratch, head);
			await provider.updateIndexInfo(scratch, entries);
			return provider.writeTree(scratch);
		});
		const guardId = `guard-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
		const present = entries.filter((entry) => entry.blob !== void 0).map((entry) => entry.path);
		const absent = entries.filter((entry) => entry.blob === void 0).map((entry) => entry.path);
		const message = [
			"guard",
			`session=${context.sessionId}`,
			`cwd=${context.cwd}`,
			...present.map((item) => `path=${item}`),
			...absent.map((item) => `absent=${item}`),
			""
		].join("\n");
		const commit = await provider.commitTree(tree, head === void 0 ? [] : [head], message);
		if (!await provider.updateRef(`refs/dsh/guards/${guardId}`, commit)) throw new Error(`rollback: failed to record guard ${guardId}`);
		return {
			guardId,
			commit,
			cwd: context.cwd,
			sessionId: context.sessionId,
			present,
			absent
		};
	}
	/** Restore the guarded content of the selected paths (all of them by default). */
	async restoreGuard(provider, guard, paths) {
		const selected = paths === void 0 ? [...guard.present, ...guard.absent] : [...new Set(paths.map((item) => provider.normalizeRelPath(item)))];
		const present = selected.filter((rel) => guard.present.includes(rel));
		const absent = selected.filter((rel) => guard.absent.includes(rel));
		if (present.length > 0) await provider.restorePaths(guard.commit, present);
		for (const rel of absent) await fs.promises.rm(provider.absolutePath(rel), { force: true });
	}
	async loadGuard(provider, guardId) {
		const commit = await provider.readRef(`${GUARDS_PREFIX}${guardId}`);
		if (commit === void 0) return void 0;
		const message = await commitMessage(provider, commit);
		const present = [];
		const absent = [];
		let cwd = "";
		let sessionId = "";
		for (const line of message.split("\n")) if (line.startsWith("path=")) present.push(line.slice(5));
		else if (line.startsWith("absent=")) absent.push(line.slice(7));
		else if (line.startsWith("cwd=")) cwd = line.slice(4);
		else if (line.startsWith("session=")) sessionId = line.slice(8);
		return {
			guardId,
			commit,
			cwd,
			sessionId,
			present,
			absent
		};
	}
	/** Open a journal entry (`running`) for a rollback about to start. */
	async journalStart(provider, guard, paths) {
		const id = `journal-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
		await this.writeJournal(provider, id, {
			id,
			phase: "running",
			guardId: guard.guardId,
			cwd: guard.cwd,
			sessionId: guard.sessionId,
			paths: [...new Set(paths)],
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
		return id;
	}
	async journalUpdate(provider, id, phase) {
		const ref = `${JOURNALS_PREFIX}${id}`;
		const current = await provider.readRef(ref);
		if (current === void 0) return;
		const record = await this.readJournal(provider, current);
		if (record === void 0) return;
		record.phase = phase;
		await this.writeJournal(provider, id, record);
	}
	async listJournals(provider) {
		const refs = await provider.listRefsDetailed(JOURNALS_PREFIX);
		const records = [];
		for (const entry of refs) {
			const record = parseJournal(entry.contents);
			if (record !== void 0) records.push({
				...record,
				id: entry.ref.slice(18)
			});
		}
		return records;
	}
	/**
	* Undo rollbacks that a dead owner left `running`, using the guard commit.
	* Journals live in the session's isolated repo, so only sessions that still
	* exist are reconciled (a deleted session takes its guard with it).
	*/
	async reconcileRunning(ctx, snapshots) {
		for (const session of ctx.sessions.list()) {
			const cwd = session.header?.cwd;
			if (cwd === void 0 || cwd === "") continue;
			let records;
			const provider = snapshots.providerFor(cwd, session.id);
			try {
				if (!await provider.available()) continue;
				records = await this.listJournals(provider);
			} catch {
				continue;
			}
			for (const record of records) {
				if (record.phase !== "running" || record.guardId === void 0) continue;
				const lock = await this.readLock(record.cwd ?? cwd);
				if (lock !== void 0 && isAlive(lock.ownerPid) && Date.now() - lock.createdAt <= this.options.lockStaleMs) continue;
				try {
					const guard = await this.loadGuard(provider, record.guardId);
					if (guard === void 0) {
						await this.journalUpdate(provider, record.id, "interrupted");
						continue;
					}
					await this.restoreGuard(provider, guard, record.paths);
					await this.journalUpdate(provider, record.id, "rolled-back");
				} catch (error) {
					ctx.logger.warn(`rollback reconciliation failed for journal ${record.id}:`, error);
					await this.journalUpdate(provider, record.id, "interrupted");
				}
			}
		}
	}
	async writeJournal(provider, id, record) {
		const ref = `${JOURNALS_PREFIX}${id}`;
		const previous = await provider.readRef(ref);
		const tree = previous !== void 0 ? await provider.treeOf(previous) : await this.emptyTree(provider);
		record.updatedAt = Date.now();
		const message = [
			`state=${record.phase}`,
			`created=${record.createdAt}`,
			`updated=${record.updatedAt}`,
			...record.guardId === void 0 ? [] : [`guard=${record.guardId}`],
			...record.cwd === void 0 ? [] : [`cwd=${record.cwd}`],
			...record.sessionId === void 0 ? [] : [`session=${record.sessionId}`],
			...record.paths.map((item) => `path=${item}`),
			""
		].join("\n");
		const commit = await provider.commitTree(tree, previous === void 0 ? [] : [previous], message);
		await provider.updateRef(ref, commit, previous);
	}
	/** The empty tree, used for the first commit of a journal chain. */
	async emptyTree(provider) {
		return provider.withScratch(async (scratch) => {
			await provider.readTree(scratch, void 0);
			return provider.writeTree(scratch);
		});
	}
	async readJournal(provider, commit) {
		return parseJournal(await commitMessage(provider, commit));
	}
	async isStale(file) {
		const lock = readLock(file);
		if (lock === void 0) return true;
		if (!isAlive(lock.ownerPid)) return true;
		return Date.now() - lock.createdAt > this.options.lockStaleMs;
	}
};
function parseJournal(message) {
	let phase;
	let guardId;
	let cwd;
	let sessionId;
	let createdAt = 0;
	let updatedAt = 0;
	const paths = [];
	for (const line of message.split("\n")) if (line.startsWith("state=")) {
		const value = line.slice(6);
		if (value === "running" || value === "completed" || value === "rolled-back" || value === "interrupted") phase = value;
	} else if (line.startsWith("guard=")) guardId = line.slice(6);
	else if (line.startsWith("cwd=")) cwd = line.slice(4);
	else if (line.startsWith("session=")) sessionId = line.slice(8);
	else if (line.startsWith("created=")) createdAt = Number(line.slice(8)) || 0;
	else if (line.startsWith("updated=")) updatedAt = Number(line.slice(8)) || 0;
	else if (line.startsWith("path=")) paths.push(line.slice(5));
	if (phase === void 0) return void 0;
	return {
		id: "",
		phase,
		paths,
		createdAt,
		updatedAt,
		...guardId === void 0 ? {} : { guardId },
		...cwd === void 0 ? {} : { cwd },
		...sessionId === void 0 ? {} : { sessionId }
	};
}
async function commitMessage(provider, commit) {
	const result = await provider.run([
		"log",
		"-1",
		"--format=%B",
		commit
	]);
	return result.code === 0 ? result.stdout : "";
}
function readLock(file) {
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		if (typeof parsed.ownerPid !== "number" || typeof parsed.nonce !== "string" || typeof parsed.createdAt !== "number") return void 0;
		return parsed;
	} catch {
		return;
	}
}
function isAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === "EPERM";
	}
}
function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
//#endregion
//#region lib/types/host/service.js
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
const DEFAULT_ROLLBACK_CONFIG = {
	enabled: true,
	snapshotOnPreStep: true,
	maxSnapshotsPerSession: 200,
	maxDiffHunksPerFile: 20,
	maxDiffBytesPerFile: 256 * 1024,
	restoreChunkSize: 64,
	guardRetentionMs: 720 * 60 * 60 * 1e3,
	lockStaleMs: 600 * 1e3,
	spawnTimeoutMs: 60 * 1e3,
	trackingEnabled: true,
	maxBlobBytes: 8 * 1024 * 1024,
	maxTrackedCallsPerSession: 500,
	diffContextLines: 3
};
let RollbackService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _prepare_decorators;
	let _execute_decorators;
	let _openAt_decorators;
	let _status_decorators;
	let _prepareTurn_decorators;
	let _sessionChanges_decorators;
	let _refreshChanges_decorators;
	let _acceptAll_decorators;
	let _acceptFile_decorators;
	let _acceptModification_decorators;
	let _undoAll_decorators;
	let _undoFile_decorators;
	let _undoModification_decorators;
	let _undoHunks_decorators;
	return class RollbackService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_prepare_decorators = [Remote];
			_execute_decorators = [Remote];
			_openAt_decorators = [Remote];
			_status_decorators = [Remote];
			_prepareTurn_decorators = [Remote];
			_sessionChanges_decorators = [Remote];
			_refreshChanges_decorators = [Remote];
			_acceptAll_decorators = [Remote];
			_acceptFile_decorators = [Remote];
			_acceptModification_decorators = [Remote];
			_undoAll_decorators = [Remote];
			_undoFile_decorators = [Remote];
			_undoModification_decorators = [Remote];
			_undoHunks_decorators = [Remote];
			__esDecorate(this, null, _prepare_decorators, {
				kind: "method",
				name: "prepare",
				static: false,
				private: false,
				access: {
					has: (obj) => "prepare" in obj,
					get: (obj) => obj.prepare
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _execute_decorators, {
				kind: "method",
				name: "execute",
				static: false,
				private: false,
				access: {
					has: (obj) => "execute" in obj,
					get: (obj) => obj.execute
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _openAt_decorators, {
				kind: "method",
				name: "openAt",
				static: false,
				private: false,
				access: {
					has: (obj) => "openAt" in obj,
					get: (obj) => obj.openAt
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _status_decorators, {
				kind: "method",
				name: "status",
				static: false,
				private: false,
				access: {
					has: (obj) => "status" in obj,
					get: (obj) => obj.status
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _prepareTurn_decorators, {
				kind: "method",
				name: "prepareTurn",
				static: false,
				private: false,
				access: {
					has: (obj) => "prepareTurn" in obj,
					get: (obj) => obj.prepareTurn
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _sessionChanges_decorators, {
				kind: "method",
				name: "sessionChanges",
				static: false,
				private: false,
				access: {
					has: (obj) => "sessionChanges" in obj,
					get: (obj) => obj.sessionChanges
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _refreshChanges_decorators, {
				kind: "method",
				name: "refreshChanges",
				static: false,
				private: false,
				access: {
					has: (obj) => "refreshChanges" in obj,
					get: (obj) => obj.refreshChanges
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _acceptAll_decorators, {
				kind: "method",
				name: "acceptAll",
				static: false,
				private: false,
				access: {
					has: (obj) => "acceptAll" in obj,
					get: (obj) => obj.acceptAll
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _acceptFile_decorators, {
				kind: "method",
				name: "acceptFile",
				static: false,
				private: false,
				access: {
					has: (obj) => "acceptFile" in obj,
					get: (obj) => obj.acceptFile
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _acceptModification_decorators, {
				kind: "method",
				name: "acceptModification",
				static: false,
				private: false,
				access: {
					has: (obj) => "acceptModification" in obj,
					get: (obj) => obj.acceptModification
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _undoAll_decorators, {
				kind: "method",
				name: "undoAll",
				static: false,
				private: false,
				access: {
					has: (obj) => "undoAll" in obj,
					get: (obj) => obj.undoAll
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _undoFile_decorators, {
				kind: "method",
				name: "undoFile",
				static: false,
				private: false,
				access: {
					has: (obj) => "undoFile" in obj,
					get: (obj) => obj.undoFile
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _undoModification_decorators, {
				kind: "method",
				name: "undoModification",
				static: false,
				private: false,
				access: {
					has: (obj) => "undoModification" in obj,
					get: (obj) => obj.undoModification
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _undoHunks_decorators, {
				kind: "method",
				name: "undoHunks",
				static: false,
				private: false,
				access: {
					has: (obj) => "undoHunks" in obj,
					get: (obj) => obj.undoHunks
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		host = __runInitializers(this, _instanceExtraInitializers);
		config;
		snapshots;
		safety;
		acceptBase;
		restore;
		sessionChangeManager;
		tracker;
		constructor(ctx, config = {}) {
			super(ctx, "rollback");
			this.host = ctx;
			this.config = {
				...DEFAULT_ROLLBACK_CONFIG,
				...config
			};
			const ledgerDir = changeLedgerRoot();
			this.snapshots = new SnapshotManager({
				maxSnapshotsPerSession: this.config.maxSnapshotsPerSession,
				ledgerDir,
				spawnTimeoutMs: this.config.spawnTimeoutMs,
				maxDiffHunksPerFile: this.config.maxDiffHunksPerFile,
				maxDiffBytesPerFile: this.config.maxDiffBytesPerFile,
				restoreChunkSize: this.config.restoreChunkSize
			}, this.host);
			this.safety = new RollbackSafety({
				lockStaleMs: this.config.lockStaleMs,
				guardRetentionMs: this.config.guardRetentionMs,
				lockTimeoutMs: 1e4
			});
			this.acceptBase = new AcceptBase(this.host, this.snapshots, { spawnTimeoutMs: this.config.spawnTimeoutMs });
			this.tracker = new CallTracker(this.host, this.snapshots, {
				maxBlobBytes: this.config.maxBlobBytes,
				maxCallsPerSession: this.config.maxTrackedCallsPerSession
			});
			this.restore = new RollbackRestore(this.host, this.snapshots, this.tracker, this.safety, {
				maxDiffHunksPerFile: this.config.maxDiffHunksPerFile,
				maxDiffBytesPerFile: this.config.maxDiffBytesPerFile,
				restoreChunkSize: this.config.restoreChunkSize,
				spawnTimeoutMs: this.config.spawnTimeoutMs
			});
			this.sessionChangeManager = new SessionChangeManager(this.host, this.snapshots, this.tracker, this.acceptBase, this.safety, {
				maxDiffHunksPerFile: this.config.maxDiffHunksPerFile,
				maxDiffBytesPerFile: this.config.maxDiffBytesPerFile,
				spawnTimeoutMs: this.config.spawnTimeoutMs,
				diffContextLines: this.config.diffContextLines
			});
		}
		prepare(sessionId, messageId, _signal) {
			return this.restore.prepare(sessionId, messageId);
		}
		execute(request, _signal) {
			return this.restore.execute(request);
		}
		openAt(sessionId, path, line, _signal) {
			return this.restore.openAt(sessionId, {
				sessionId,
				path,
				...line === void 0 ? {} : { line }
			});
		}
		status(sessionId, _signal) {
			return this.restore.status(sessionId);
		}
		prepareTurn(sessionId, turn, _signal) {
			return this.restore.prepareTurn(sessionId, turn);
		}
		sessionChanges(sessionId, _signal) {
			return this.sessionChangeManager.sessionChanges(sessionId);
		}
		/**
		* Explicit refresh: capture the worktree first when a turn is running, so
		* bash-created files show up now instead of at the next turn boundary.
		*/
		refreshChanges(sessionId, _signal) {
			return this.sessionChangeManager.refreshSessionChanges(sessionId);
		}
		acceptAll(request, _signal) {
			return this.sessionChangeManager.acceptAll(request);
		}
		acceptFile(request, _signal) {
			return this.sessionChangeManager.acceptFile(request);
		}
		acceptModification(request, _signal) {
			return this.sessionChangeManager.acceptModification(request);
		}
		undoAll(request, _signal) {
			return this.sessionChangeManager.undoAll(request);
		}
		undoFile(request, _signal) {
			return this.sessionChangeManager.undoFile(request);
		}
		undoModification(request, _signal) {
			return this.sessionChangeManager.undoModification(request);
		}
		undoHunks(request, _signal) {
			return this.sessionChangeManager.undoHunks(request);
		}
	};
})();
//#endregion
//#region lib/types/shared/json-codec.js
/**
* Strict JSON codec used by the hand-written rollback Remote contribution.
*
* `dsh-api-gateway` requires every generated Remote parameter and result to
* carry a `strict` codec; the Host boundary additionally re-validates that
* the decoded value is JSON-safe. Business validation stays in the service
* methods, so this codec intentionally performs the identity transform.
*/
function jsonCodec(typeSymbol) {
	return {
		mode: "strict",
		typeSymbol,
		create: () => ({ parse(value) {
			return value;
		} })
	};
}
//#endregion
//#region lib/types/host/typert.js
const ROLLBACK_PACKAGE = "dsh-rollback-plugin";
function invocation(method, parameters, withSignal) {
	return {
		id: `${ROLLBACK_PACKAGE}#rollback/${method}`,
		service: "rollback",
		namespace: "rollback",
		method,
		invocation: { kind: "direct" },
		parameters,
		...withSignal ? { cancellation: { parameter: "signal" } } : {},
		result: jsonCodec("dsh-rollback-plugin#RemoteResult")
	};
}
/** Hand-written Host Typert contribution with strict JSON codecs. */
const ROLLBACK_HOST_TYPERT = {
	package: ROLLBACK_PACKAGE,
	face: "host",
	schemas: [],
	model: {
		services: [{
			key: "rollback",
			exportName: "RollbackService",
			summary: "Message-level workspace rollback with file and tool-modification granularity.",
			tags: [],
			members: [
				{
					kind: "method",
					name: "prepare",
					signature: "@Remote prepare(sessionId: string, messageId: string, signal?: AbortSignal): Promise<RollbackPrepareResult>"
				},
				{
					kind: "method",
					name: "execute",
					signature: "@Remote execute(request: RollbackExecuteRequest, signal?: AbortSignal): Promise<RollbackExecuteResult>"
				},
				{
					kind: "method",
					name: "openAt",
					signature: "@Remote openAt(sessionId: string, path: string, line?: number, signal?: AbortSignal): Promise<OpenAtResult>"
				},
				{
					kind: "method",
					name: "status",
					signature: "@Remote status(sessionId: string, signal?: AbortSignal): Promise<RollbackStatusResult>"
				},
				{
					kind: "method",
					name: "prepareTurn",
					signature: "@Remote prepareTurn(sessionId: string, turn: number, signal?: AbortSignal): Promise<RollbackPrepareTurnResult>"
				},
				{
					kind: "method",
					name: "acceptAll",
					signature: "@Remote acceptAll(request: RollbackAcceptAllRequest, signal?: AbortSignal): Promise<RollbackAcceptAllResult>"
				},
				{
					kind: "method",
					name: "undoAll",
					signature: "@Remote undoAll(request: RollbackUndoAllRequest, signal?: AbortSignal): Promise<RollbackUndoAllResult>"
				},
				{
					kind: "method",
					name: "sessionChanges",
					signature: "@Remote sessionChanges(sessionId: string, signal?: AbortSignal): Promise<RollbackSessionChangesResult>"
				},
				{
					kind: "method",
					name: "refreshChanges",
					signature: "@Remote refreshChanges(sessionId: string, signal?: AbortSignal): Promise<RollbackSessionChangesResult>"
				},
				{
					kind: "method",
					name: "acceptFile",
					signature: "@Remote acceptFile(request: RollbackAcceptFileRequest, signal?: AbortSignal): Promise<RollbackAcceptResult>"
				},
				{
					kind: "method",
					name: "acceptModification",
					signature: "@Remote acceptModification(request: RollbackAcceptModificationRequest, signal?: AbortSignal): Promise<RollbackAcceptResult>"
				},
				{
					kind: "method",
					name: "undoFile",
					signature: "@Remote undoFile(request: RollbackUndoFileRequest, signal?: AbortSignal): Promise<RollbackUndoFileResult>"
				},
				{
					kind: "method",
					name: "undoModification",
					signature: "@Remote undoModification(request: RollbackUndoModificationRequest, signal?: AbortSignal): Promise<RollbackUndoModificationResult>"
				},
				{
					kind: "method",
					name: "undoHunks",
					signature: "@Remote undoHunks(request: RollbackUndoHunksRequest, signal?: AbortSignal): Promise<RollbackUndoHunksResult>"
				}
			],
			types: []
		}],
		events: [],
		objects: []
	},
	invocations: [
		invocation("prepare", [{
			name: "sessionId",
			wire: "sessionId",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}, {
			name: "messageId",
			wire: "messageId",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("execute", [{
			name: "request",
			wire: "request",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("openAt", [
			{
				name: "sessionId",
				wire: "sessionId",
				source: "json",
				codec: jsonCodec("dsh-rollback-plugin#JsonValue")
			},
			{
				name: "path",
				wire: "path",
				source: "json",
				codec: jsonCodec("dsh-rollback-plugin#JsonValue")
			},
			{
				name: "line",
				wire: "line",
				source: "json",
				codec: jsonCodec("dsh-rollback-plugin#JsonValue"),
				acceptsUndefined: true
			}
		], true),
		invocation("status", [{
			name: "sessionId",
			wire: "sessionId",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("prepareTurn", [{
			name: "sessionId",
			wire: "sessionId",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}, {
			name: "turn",
			wire: "turn",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("acceptAll", [{
			name: "request",
			wire: "request",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("undoAll", [{
			name: "request",
			wire: "request",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("sessionChanges", [{
			name: "sessionId",
			wire: "sessionId",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("refreshChanges", [{
			name: "sessionId",
			wire: "sessionId",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("acceptFile", [{
			name: "request",
			wire: "request",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("acceptModification", [{
			name: "request",
			wire: "request",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("undoFile", [{
			name: "request",
			wire: "request",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("undoModification", [{
			name: "request",
			wire: "request",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true),
		invocation("undoHunks", [{
			name: "request",
			wire: "request",
			source: "json",
			codec: jsonCodec("dsh-rollback-plugin#JsonValue")
		}], true)
	]
};
ROLLBACK_HOST_TYPERT.invocations;
//#endregion
//#region lib/types/host/index.js
const name = "rollback";
const inject = [
	"sessions",
	"agents",
	"fs",
	"typert"
];
function apply(ctx, options = {}) {
	if (options.enabled === false) return;
	const host = ctx;
	const service = new RollbackService(ctx, options);
	ctx.on("session/disposed", (session) => {
		service.sessionChangeManager.noteSessionEnd(session);
	});
	ctx.on("session/event", (session, event) => {
		if (event.type === "turn/start") {
			if (service.config.snapshotOnPreStep) service.sessionChangeManager.beginTurnStart(session, event.data.turn);
			return;
		}
		if (event.type !== "turn/end") return;
		service.sessionChangeManager.noteTurnEnd(session, event.data.turn);
	});
	const typert = ctx.typert;
	if (typert !== void 0) ctx.effect(() => typert.register(ROLLBACK_HOST_TYPERT), "rollback: typert host contribution");
	else host.logger.warn("rollback: typert service unavailable; Remote methods may use the SRC fallback");
	ctx.on("agent/pre-step", async (payload, next) => {
		const session = payload.agent.session;
		const cwd = session.header?.cwd;
		if (payload.step === 1 && service.config.trackingEnabled && cwd !== void 0 && cwd !== "" && !isSubagentSession(session)) try {
			await service.tracker.flush(session.id);
			await service.tracker.ensureBase(session.id, cwd);
		} catch (error) {
			host.logger.warn("rollback call tracking skipped:", error);
		}
		if (payload.step === 1 && service.config.snapshotOnPreStep && !isSubagentSession(session)) {
			const settle = service.sessionChangeManager.beginTurnStart(session, payload.turn);
			try {
				const manifest = await service.snapshots.capture(session, payload.turn);
				if (manifest?.tree !== void 0) {
					const gap = service.sessionChangeManager.noteTurnStart(session, payload.turn, manifest.tree);
					if (gap === void 0) settle();
					else gap.finally(settle);
				} else settle();
			} catch (error) {
				host.logger.warn("rollback snapshot skipped:", error);
				settle();
			}
		}
		return next();
	}, { prepend: true });
	installTrackingListeners(ctx, service);
	service.safety.reconcileRunning(host, service.snapshots).catch((error) => {
		host.logger.warn("rollback startup reconciliation skipped:", error);
	});
}
/**
* Per-call tracking listens to `fs/observed` for the post-image and to the
* write/edit *intents* for session-start pre-images.
*
* The intent hooks are prepended and transparent: they capture only the first
* touch of a path the chain base tree cannot see (ignored files, excluded
* nested paths) and then call `next()`, so the observation-policy guard — a
* single-slot decision that does not call `next()` itself — is preserved.
* Tracked files are an in-memory set lookup, which keeps the tool critical
* path free of whole-file reads for the normal case.
*/
function installTrackingListeners(ctx, service) {
	const host = ctx;
	ctx.on("fs/observed", (target, observation, actor) => {
		if (!service.config.trackingEnabled) return;
		try {
			service.tracker.observe(target, observation, actor);
		} catch (error) {
			host.logger.warn("rollback call tracking failed:", error);
		}
	});
	const capturePreImage = async (target, actor) => {
		if (!service.config.trackingEnabled) return;
		try {
			await service.tracker.capturePreImage(target, actor);
		} catch (error) {
			host.logger.warn("rollback pre-image capture failed:", error);
		}
	};
	ctx.on("fs/write-intent", async (target, actor, next) => {
		await capturePreImage(target, actor);
		return next();
	}, { prepend: true });
	ctx.on("fs/edit-intent", async (target, actor, next) => {
		await capturePreImage(target, actor);
		return next();
	}, { prepend: true });
}
//#endregion
export { ACCEPTED_REF, AcceptBase, CHAIN_BASE_REF, CHAIN_HEAD_REF, CHAIN_PRE_REF, CallTracker, DEFAULT_ROLLBACK_CONFIG, GAP_DELETED_REF, GAP_REF, GitProvider, POINTS_PREFIX, PROGRESS_REF, RollbackService, SESSION_END_REF, SessionChangeManager, SnapshotManager, TURN_END_REF, apply, applyHunkUndo, attachToolCalls, boundaryInfo, buildFileChange, changeLedgerRoot, diffGitPath, encodeSessionSegment, findPreviousTurnEnd, hunkFingerprint, inject, installTrackingListeners, isHash, journalsPath, locksDir, manifestsPath, name, parseDiffHunks, parseDiffTreeZ, patchFileViews, pointRef, projectDirKey, readJsonFile, replayPatches, resolveBoundary, resolveBoundaryForTurn, resolveDshHome, sessionDirFor, sessionIdleEnd, sessionSnapshotRepo, sessionStartTurn, spawnGit, splitDiffByPath, splitDiffSections, splitPatchFiles, summarize, unquoteGitPath, writeJsonFileAtomic };

//# sourceMappingURL=index.js.map