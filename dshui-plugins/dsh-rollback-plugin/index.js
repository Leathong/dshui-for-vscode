import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import * as crypto from "node:crypto";
//#region lib/types/host/providers/git.js
const HEX_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const RUNNING_OPS = [
	"MERGE_HEAD",
	"CHERRY_PICK_HEAD",
	"REVERT_HEAD",
	"BISECT_LOG"
];
function isHash(value) {
	return HEX_RE.test(value);
}
function spawnGit(cwd, args, env, timeoutMs, signal) {
	return new Promise((resolve, reject) => {
		const child = spawn("git", [
			"-C",
			cwd,
			...args
		], {
			env: {
				...env,
				GIT_TERMINAL_PROMPT: "0",
				GIT_OPTIONAL_LOCKS: "0",
				LC_ALL: "C"
			},
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			],
			windowsHide: true
		});
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
	isGit;
	gitDir;
	constructor(cwd, options) {
		this.cwd = cwd;
		this.options = options;
		const env = { ...process.env };
		delete env.GIT_DIR;
		delete env.GIT_WORK_TREE;
		delete env.GIT_INDEX_FILE;
		this.baseEnv = env;
	}
	async available(signal) {
		if (this.isGit !== void 0) return this.isGit;
		try {
			const result = await this.run(["rev-parse", "--is-inside-work-tree"], signal);
			this.isGit = result.code === 0 && result.stdout.trim() === "true";
			if (this.isGit) {
				const gitDir = await this.run(["rev-parse", "--absolute-git-dir"], signal);
				if (gitDir.code === 0) this.gitDir = path.resolve(this.cwd, gitDir.stdout.trim());
			}
		} catch {
			this.isGit = false;
		}
		return this.isGit;
	}
	async head(signal) {
		const result = await this.run([
			"rev-parse",
			"--verify",
			"HEAD"
		], signal);
		if (result.code !== 0 || !isHash(result.stdout.trim())) return void 0;
		return result.stdout.trim();
	}
	/** Snapshot the entire worktree into a temporary-index tree object. */
	async captureTree(signal) {
		const index = await this.createTempIndex();
		try {
			const reset = await this.run(["read-tree", "--empty"], signal, index);
			if (reset.code !== 0) throw new Error(`git read-tree --empty failed: ${reset.stderr.trim()}`);
			const added = await this.run(["add", "-A"], signal, index);
			if (added.code !== 0) throw new Error(`git add -A failed: ${added.stderr.trim()}`);
			const ledgerRel = this.ledgerRelativePath();
			if (ledgerRel !== void 0) {
				const removed = await this.run([
					"rm",
					"-r",
					"--cached",
					"--ignore-unmatch",
					"--quiet",
					"--",
					ledgerRel
				], signal, index);
				if (removed.code !== 0 && removed.stderr.trim() !== "") throw new Error(`git rm (ledger exclusion) failed: ${removed.stderr.trim()}`);
			}
			const result = await this.run(["write-tree"], signal, index);
			if (result.code !== 0) throw new Error(`git write-tree failed: ${result.stderr.trim()}`);
			const tree = result.stdout.trim();
			if (!isHash(tree)) throw new Error(`git write-tree returned invalid tree hash: ${tree}`);
			return tree;
		} finally {
			fs.rmSync(index, { force: true });
			fs.rmSync(path.dirname(index), {
				recursive: true,
				force: true
			});
		}
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
		await this.available(signal);
		if (this.gitDir === void 0) return false;
		for (const marker of RUNNING_OPS) if (fs.existsSync(path.join(this.gitDir, marker))) return true;
		for (const dir of ["rebase-merge", "rebase-apply"]) if (fs.existsSync(path.join(this.gitDir, dir))) return true;
		return false;
	}
	async run(args, signal, indexFile) {
		const env = indexFile === void 0 ? this.baseEnv : {
			...this.baseEnv,
			GIT_INDEX_FILE: indexFile
		};
		return spawnGit(this.cwd, args, env, this.options.spawnTimeoutMs, signal);
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
	ledgerRelativePath() {
		const ledger = this.options.ledgerDir;
		if (ledger === void 0 || ledger === "") return void 0;
		const abs = path.resolve(ledger);
		const rel = path.relative(this.cwd, abs);
		if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`)) return void 0;
		return rel.split(path.sep).join("/");
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
			} else if (body.startsWith("-")) oldLines.push(body.slice(1));
			else if (body.startsWith("+")) newLines.push(body.slice(1));
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
			...parsed.endLine === void 0 ? {} : { endLine: parsed.endLine }
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
//#region lib/types/host/snapshot.js
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
var SnapshotManager = class {
	options;
	ctx;
	manifests = [];
	loaded = false;
	writeTail = Promise.resolve();
	domainStorePromise;
	constructor(options, ctx) {
		this.options = options;
		this.ctx = ctx;
	}
	get ledgerDir() {
		return this.options.ledgerDir;
	}
	providerFor(cwd) {
		return new GitProvider(cwd, {
			spawnTimeoutMs: this.options.spawnTimeoutMs,
			maxDiffHunksPerFile: this.options.maxDiffHunksPerFile,
			maxDiffBytesPerFile: this.options.maxDiffBytesPerFile,
			restoreChunkSize: this.options.restoreChunkSize,
			ledgerDir: this.options.ledgerDir
		});
	}
	/** Capture the pre-step baseline. Failures are caught by the caller and never block the agent. */
	async capture(session, turn) {
		const cwd = session.header.cwd;
		if (cwd === void 0 || cwd === "") return void 0;
		await this.load();
		if (this.manifests.some((item) => item.sessionId === session.id && item.turn === turn)) return void 0;
		const provider = this.providerFor(cwd);
		const head = await provider.head().catch(() => void 0);
		let tree;
		let mode = "ledger";
		if (await provider.available().catch(() => false)) {
			tree = await provider.captureTree().catch((error) => {});
			if (tree !== void 0) mode = "git";
			if (tree === void 0) {
				tree = await provider.captureTree().catch(() => void 0);
				if (tree !== void 0) mode = "git";
			}
		}
		if (tree === void 0) mode = "ledger";
		const manifest = {
			snapshotId: `${session.id}:${turn}:${Date.now().toString(36)}`,
			sessionId: session.id,
			turn,
			cwd,
			...tree === void 0 ? {} : { tree },
			...head === void 0 ? {} : { head },
			createdAt: Date.now(),
			mode,
			...turnStartSeq(session, turn) === void 0 ? {} : { turnStartSeq: turnStartSeq(session, turn) }
		};
		const next = this.manifests.filter((item) => !(item.sessionId === session.id && item.turn === turn));
		next.push(manifest);
		this.enqueuePersist(trimManifests(next, this.options.maxSnapshotsPerSession));
		return manifest;
	}
	/** Exact snapshot first, then the newest earlier snapshot for the same session. */
	async find(sessionId, targetTurn) {
		await this.load();
		const exact = this.manifests.filter((item) => item.sessionId === sessionId && item.turn === targetTurn).sort((a, b) => b.createdAt - a.createdAt)[0];
		if (exact !== void 0) return {
			manifest: exact,
			degraded: false
		};
		const earlier = this.manifests.filter((item) => item.sessionId === sessionId && item.turn < targetTurn).sort((a, b) => b.turn - a.turn || b.createdAt - a.createdAt)[0];
		if (earlier === void 0) return void 0;
		return {
			manifest: earlier,
			degraded: true
		};
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
	async listForSession(sessionId) {
		await this.load();
		return this.manifests.filter((item) => item.sessionId === sessionId).sort((a, b) => b.turn - a.turn || b.createdAt - a.createdAt);
	}
	async load() {
		if (this.loaded) return;
		this.loaded = true;
		const store = await this.domainStore();
		if (store !== void 0) {
			this.manifests = await store.read();
			return;
		}
		this.manifests = await readJsonFile(manifestsPath(), []);
	}
	enqueuePersist(next) {
		this.manifests = next;
		this.writeTail = this.writeTail.catch(() => void 0).then(async () => {
			const store = await this.domainStore();
			if (store !== void 0) await store.write(this.manifests);
			await writeJsonFileAtomic(manifestsPath(), this.manifests);
		}).catch(() => void 0);
	}
	/** Open the storage-domain table when the Host composition provides one. */
	domainStore() {
		this.domainStorePromise ??= this.openDomainStore().catch((error) => {
			if (this.ctx !== void 0) this.ctx.logger.warn("rollback: storage-domain unavailable, using JSON manifests:", error);
		});
		return this.domainStorePromise;
	}
	async openDomainStore() {
		if (this.ctx === void 0) return void 0;
		const facility = this.ctx.get("storageDomain");
		if (facility === void 0 || typeof facility.open !== "function") return void 0;
		const [domainModule, schemaModule] = await Promise.all([import("@deepseek-ai/dsh-storage-domain"), import("@deepseek-ai/schemastery")]);
		const z = schemaModule.default;
		const spec = domainModule.defineDomain({
			name: "rollback",
			version: 1,
			tables: { manifests: domainModule.domainTable(z.any()) }
		});
		const table = (await facility.open(spec)).table("manifests");
		return {
			read: async () => {
				const value = table.get("manifests");
				return Array.isArray(value?.items) ? value.items : [];
			},
			write: async (value) => table.put("manifests", { items: value })
		};
	}
};
function trimManifests(manifests, maxPerSession) {
	const bySession = /* @__PURE__ */ new Map();
	for (const manifest of manifests) {
		const list = bySession.get(manifest.sessionId) ?? [];
		list.push(manifest);
		bySession.set(manifest.sessionId, list);
	}
	const result = [];
	for (const list of bySession.values()) result.push(...list.slice(-maxPerSession));
	return result;
}
function turnStartSeq(session, turn) {
	return session.events.find((item) => item.type === "turn/start" && item.data.turn === turn)?.seq;
}
//#endregion
//#region lib/types/host/ledger.js
function jsonSafe(value) {
	try {
		const text = JSON.stringify(value);
		return text === void 0 ? void 0 : text;
	} catch {
		return;
	}
}
function safePathKey(target) {
	return target.targetKey;
}
function normalizeLf(text) {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
/** Compute a whole-file diff hunk between two text snapshots. */
function wholeFileHunk(before, after) {
	if (before === null) return [{
		oldText: null,
		newText: after,
		newLine: 1,
		endLine: countLines(after)
	}];
	if (before === after) return [];
	return [{
		oldText: before,
		newText: after,
		oldLine: 1,
		newLine: 1,
		endLine: countLines(after)
	}];
}
function countLines(text) {
	if (text === "") return 1;
	return text.split("\n").length;
}
/** Open turn/step for a session, derived from the durable log boundaries. */
function sessionTurnPosition(session) {
	let turn = 0;
	let step = 0;
	let seq = -1;
	for (const event of session.events) {
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
/** Persistence file for ledger records (JSON fallback next to the manifests). */
function ledgerRecordsPath() {
	return path.join(changeLedgerRoot(), "v1", "ledger.json");
}
function readJsonFileSync(file, fallback) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return fallback;
	}
}
function trimRecords(records, maxPerSession) {
	const bySession = /* @__PURE__ */ new Map();
	for (const record of records) {
		const list = bySession.get(record.sessionId) ?? [];
		list.push(record);
		bySession.set(record.sessionId, list);
	}
	const result = [];
	for (const list of bySession.values()) result.push(...list.slice(-maxPerSession));
	return result;
}
var ChangeLedger = class {
	ctx;
	options;
	records = [];
	pending = /* @__PURE__ */ new Map();
	writeTail = Promise.resolve();
	maxLedgerRecordsPerSession;
	ledgerFile;
	constructor(ctx, options) {
		this.ctx = ctx;
		this.options = options;
		this.maxLedgerRecordsPerSession = options.maxLedgerRecordsPerSession ?? 500;
		this.ledgerFile = options.ledgerFile ?? ledgerRecordsPath();
		this.records.push(...readJsonFileSync(this.ledgerFile, []));
	}
	get ledgerMaxTextBytes() {
		return this.options.ledgerMaxTextBytes;
	}
	/** Prepend listener for fs/write-intent; must call next() so the policy slot stays intact. */
	async captureWriteBefore(target, actor, next) {
		await this.captureBefore("write", target, actor);
		return await next();
	}
	/** Prepend listener for fs/edit-intent; must call next() so the policy slot stays intact. */
	async captureEditBefore(target, actor, next) {
		await this.captureBefore("edit", target, actor);
		return await next();
	}
	/** Record a successful fs observation against a pending write/edit capture. */
	observe(target, observation, actor) {
		if (observation.kind !== "present") return;
		const key = safePathKey(target);
		const list = this.pending.get(key);
		if (list === void 0 || list.length === 0) return;
		const index = list.findIndex((item) => actor?.callId !== void 0 && item.modificationId === actor.callId);
		const selected = index >= 0 ? list[index] : list[list.length - 1];
		if (selected === void 0) return;
		if (index >= 0) list.splice(index, 1);
		else list.pop();
		if (list.length === 0) this.pending.delete(key);
		const session = actor?.agent?.session;
		const position = session === void 0 ? void 0 : this.positionForCall(session, selected.modificationId);
		const fallback = session === void 0 ? void 0 : sessionTurnPosition(session);
		const turn = position?.turn ?? fallback?.turn ?? 0;
		const step = position?.step ?? fallback?.step ?? 0;
		const seq = position?.seq ?? fallback?.seq ?? -1;
		const argsRaw = selected.actorArguments === void 0 ? void 0 : jsonSafe(selected.actorArguments);
		this.records.push({
			modificationId: selected.modificationId,
			toolName: selected.toolName,
			path: selected.path,
			sessionId: selected.sessionId,
			turn,
			step,
			seq,
			...argsRaw === void 0 || argsRaw.length > this.options.ledgerMaxTextBytes ? {} : { argsRaw },
			beforeExisted: selected.beforeExisted,
			...selected.beforeVersion === void 0 ? {} : { beforeVersion: selected.beforeVersion },
			...selected.beforeContent === void 0 ? {} : { beforeContent: selected.beforeContent },
			...selected.beforeBinary === true ? { beforeBinary: true } : {},
			observedVersion: observation.version,
			createdAt: Date.now()
		});
		this.enqueuePersist();
	}
	list(sessionId) {
		return sessionId === void 0 ? [...this.records] : this.records.filter((record) => record.sessionId === sessionId);
	}
	listForTurn(sessionId, turn) {
		return this.records.filter((record) => record.sessionId === sessionId && record.turn === turn).sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt);
	}
	/** Earliest before-image for one path during the target turn. */
	baselineForTurn(sessionId, turn, filePath) {
		return this.listForTurn(sessionId, turn).filter((record) => samePath(record.path, filePath))[0];
	}
	/** All modifications for a path at or after one record, newest first. */
	laterModifications(sessionId, filePath, after) {
		return this.list(sessionId).filter((record) => samePath(record.path, filePath) && record.createdAt > after.createdAt).sort((a, b) => b.createdAt - a.createdAt);
	}
	recordById(sessionId, modificationId) {
		return this.records.find((record) => record.sessionId === sessionId && record.modificationId === modificationId);
	}
	/** Await pending persistence (tests and graceful shutdown paths). */
	async flush() {
		await this.writeTail.catch(() => void 0);
	}
	enqueuePersist() {
		const trimmed = trimRecords(this.records, this.maxLedgerRecordsPerSession);
		this.records.length = 0;
		this.records.push(...trimmed);
		this.writeTail = this.writeTail.catch(() => void 0).then(async () => {
			await writeJsonFileAtomic(this.ledgerFile, this.records);
		}).catch((error) => {
			this.ctx.logger.warn("rollback ledger persist failed:", error);
		});
	}
	/** Build file-level changes for ledger-covered paths that git snapshots cannot see. */
	async buildFileChanges(sessionId, turn, cwd, mode) {
		const result = [];
		const seen = /* @__PURE__ */ new Set();
		for (const record of this.listForTurn(sessionId, turn)) {
			const rel = relPathWithin(cwd, record.path);
			if (rel === void 0 || seen.has(rel)) continue;
			seen.add(rel);
			const change = await this.fileChangeForBaseline(cwd, rel, record, mode);
			if (change !== void 0) result.push(change);
		}
		return result;
	}
	async fileChangeForBaseline(cwd, rel, baseline, mode) {
		try {
			const target = await this.ctx.fs.resolve(rel, { cwd });
			const currentInfo = await this.ctx.fs.stat(target);
			if (!baseline.beforeExisted) return {
				path: rel,
				absolutePath: this.ctx.fs.processPath(target),
				status: mode === "ignored" ? "ignored" : "created",
				source: "ledger",
				restorable: false,
				createdAfterSnapshot: true
			};
			if (currentInfo === void 0) return {
				path: rel,
				absolutePath: path.resolve(cwd, rel),
				status: "deleted",
				source: "ledger",
				restorable: baseline.beforeContent !== void 0,
				...baseline.beforeContent !== void 0 ? { hunks: wholeFileHunk(baseline.beforeContent, "") } : {}
			};
			if (baseline.beforeContent === void 0) return {
				path: rel,
				absolutePath: this.ctx.fs.processPath(target),
				status: mode === "ignored" ? "ignored" : "binary",
				source: "ledger",
				restorable: false,
				binary: true
			};
			const current = await this.readText(target);
			if (current === void 0) return {
				path: rel,
				absolutePath: this.ctx.fs.processPath(target),
				status: mode === "ignored" ? "ignored" : "binary",
				source: "ledger",
				restorable: false,
				binary: true
			};
			if (current === baseline.beforeContent) return void 0;
			return {
				path: rel,
				absolutePath: this.ctx.fs.processPath(target),
				status: mode === "ignored" ? "ignored" : "modified",
				source: "ledger",
				restorable: true,
				hunks: wholeFileHunk(baseline.beforeContent, current)
			};
		} catch {
			return;
		}
	}
	/** Restore one ledger-covered path through ctx.fs, bypassing the tool waterfall. */
	async restoreLedgerPath(cwd, rel, baseline, createdPolicy) {
		const target = await this.ctx.fs.resolve(rel, { cwd });
		if (!baseline.beforeExisted) {
			if (createdPolicy !== "delete") return "kept";
			if (await this.ctx.fs.stat(target) === void 0) return "deleted";
			fs.rmSync(this.ctx.fs.processPath(target), { force: true });
			return "deleted";
		}
		const info = await this.ctx.fs.stat(target);
		if (baseline.beforeContent === void 0) return "unsupported";
		await this.ctx.fs.writeText(target, baseline.beforeContent, info === void 0 ? { kind: "createIfAbsent" } : {
			kind: "replaceIfVersion",
			version: info.version
		});
		return "restored";
	}
	async readCurrentForGuard(cwd, rel) {
		try {
			const target = await this.ctx.fs.resolve(rel, { cwd });
			const info = await this.ctx.fs.stat(target);
			if (info === void 0) return { existed: false };
			const content = info.type === "file" && (info.size ?? 0) <= this.options.ledgerMaxTextBytes ? await this.readText(target) : void 0;
			return {
				existed: true,
				version: info.version,
				size: info.size,
				...content === void 0 ? {} : { content }
			};
		} catch {
			return { existed: false };
		}
	}
	async restoreGuardFile(cwd, rel, guard) {
		const target = await this.ctx.fs.resolve(rel, { cwd });
		if (!guard.existed) {
			if (await this.ctx.fs.stat(target) !== void 0) fs.rmSync(this.ctx.fs.processPath(target), { force: true });
			return;
		}
		if (guard.content === void 0) return;
		const info = await this.ctx.fs.stat(target);
		await this.ctx.fs.writeText(target, guard.content, info === void 0 ? { kind: "createIfAbsent" } : {
			kind: "replaceIfVersion",
			version: info.version
		});
	}
	async captureBefore(toolName, target, actor) {
		const filePath = this.ctx.fs.processPath(target);
		const modificationId = actor?.callId;
		if (modificationId === void 0 || actor?.agent?.session === void 0) return;
		let info;
		let beforeContent;
		let beforeBinary = false;
		try {
			info = await this.ctx.fs.stat(target);
			if (info !== void 0 && info.type === "file" && (info.size ?? 0) <= this.options.ledgerMaxTextBytes) beforeContent = await this.ctx.fs.readText(target);
			else if (info !== void 0 && info.type === "file") beforeBinary = true;
		} catch {
			try {
				info = await this.ctx.fs.stat(target);
				if (info !== void 0) beforeBinary = true;
			} catch {
				info = void 0;
			}
		}
		const pending = {
			modificationId,
			toolName,
			path: filePath,
			sessionId: actor.agent.session.id,
			...actor.arguments === void 0 ? {} : { actorArguments: actor.arguments },
			beforeExisted: info !== void 0,
			...info?.version === void 0 ? {} : { beforeVersion: info.version },
			...beforeContent === void 0 ? {} : { beforeContent },
			...beforeBinary ? { beforeBinary: true } : {}
		};
		const key = safePathKey(target);
		const list = this.pending.get(key) ?? [];
		list.push(pending);
		this.pending.set(key, list);
	}
	positionForCall(session, callId) {
		for (const event of [...session.events].reverse()) {
			if (event.type !== "tool/call") continue;
			const data = event.data;
			if (data.callId === callId) return {
				turn: data.turn ?? 0,
				step: data.step ?? 0,
				seq: event.seq
			};
		}
	}
	async readText(target) {
		try {
			return await this.ctx.fs.readText(target);
		} catch {
			return;
		}
	}
};
function samePath(left, right) {
	return path.resolve(left) === path.resolve(right);
}
function relPathWithin(cwd, abs) {
	const rel = path.relative(cwd, abs);
	if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return void 0;
	return rel.split(path.sep).join("/");
}
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
	for (const event of session.events) {
		if (event.type !== "assistant/message") continue;
		if (event.data.message.id === messageId) assistant = event;
	}
	if (assistant === void 0) return { failure: {
		code: "message-not-found",
		message: `assistant message "${messageId}" was not found in session "${session.id}"`,
		sessionId: session.id,
		messageId
	} };
	const targetTurn = assistant.data.turn;
	if (session.events.find((event) => event.type === "turn/end" && event.data.turn === targetTurn) === void 0) return { failure: {
		code: "turn-not-completed",
		message: `turn ${targetTurn} has not completed yet`,
		sessionId: session.id,
		messageId
	} };
	const turnStart = session.events.find((event) => event.type === "turn/start" && event.data.turn === targetTurn);
	const anchor = findPreviousTurnEnd(session.events, turnStart?.seq ?? assistant.seq);
	return { boundary: {
		targetTurn,
		...anchor === void 0 ? {} : { forkAtSeq: anchor.seq },
		forkAvailable: anchor !== void 0,
		assistantEvent: assistant,
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
//#region lib/types/host/modification.js
/**
* Undo one write/edit tool modification with a three-way reverse merge:
* base = after (A), ours = current (B), theirs = before (O).
*/
async function restoreModification(ctx, ledger, cwd, record, deleteCreatedPolicy, timeoutMs) {
	const before = record.beforeContent;
	if (record.beforeExisted && before === void 0) return {
		status: "unsupported",
		detail: "no bounded text before-image for this modification"
	};
	let target;
	let current;
	let currentInfo;
	try {
		target = await ctx.fs.resolve(record.path, { cwd });
		currentInfo = await ctx.fs.stat(target);
		if (currentInfo !== void 0) current = await ctx.fs.readText(target);
	} catch {
		if (currentInfo !== void 0 && currentInfo.type === "file" && (currentInfo.size ?? 0) > ledger.ledgerMaxTextBytes) return {
			status: "unsupported",
			detail: "current file is too large for modification-level merge"
		};
		return {
			status: "failed",
			detail: "current file could not be read"
		};
	}
	const rebuilt = rebuildAfter(record);
	if (!rebuilt.ok) return {
		status: "unsupported",
		detail: rebuilt.detail
	};
	const after = normalizeLf(rebuilt.value.after);
	const currentLf = current === void 0 ? void 0 : normalizeLf(current);
	if (!record.beforeExisted || rebuilt.value.created) {
		if (current === void 0) return {
			status: "restored",
			detail: "created file is already absent"
		};
		if (currentLf !== after) return {
			status: "conflict",
			detail: "the created file was modified after the write; use whole-file restore or delete explicitly"
		};
		if (!deleteCreatedPolicy) return {
			status: "conflict",
			detail: "undoing file creation requires createdPolicy=delete"
		};
		try {
			fs.rmSync(ctx.fs.processPath(target), { force: true });
			return {
				status: "restored",
				deleted: true,
				detail: "created file deleted"
			};
		} catch (error) {
			return {
				status: "failed",
				detail: `failed to delete created file: ${String(error)}`
			};
		}
	}
	if (current === void 0) return {
		status: "conflict",
		detail: "the file no longer exists; its creation was not produced by this modification"
	};
	const beforeLf = normalizeLf(before ?? "");
	const normalizedCurrent = normalizeLf(current);
	if (normalizedCurrent === beforeLf) return {
		status: "restored",
		detail: "file already matches the pre-modification state"
	};
	const merged = await mergeFiles(normalizedCurrent, after, beforeLf, timeoutMs);
	if (!merged.ok) return {
		status: "conflict",
		detail: merged.detail ?? "three-way merge conflict"
	};
	try {
		const style = current.includes("\r\n") ? "\r\n" : "\n";
		const output = merged.value.split("\n").join(style);
		await ctx.fs.writeText(target, output, currentInfo === void 0 ? { kind: "createIfAbsent" } : {
			kind: "replaceIfVersion",
			version: currentInfo.version
		});
		if (normalizeLf(await ctx.fs.readText(target)) !== merged.value) return {
			status: "failed",
			detail: "post-write verification failed"
		};
		return { status: "restored" };
	} catch (error) {
		return {
			status: "failed",
			detail: String(error)
		};
	}
}
async function mergeFiles(current, base, other, timeoutMs) {
	const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dsh-rollback-merge-"));
	const currentFile = path.join(dir, "B");
	const baseFile = path.join(dir, "A");
	const otherFile = path.join(dir, "O");
	try {
		await Promise.all([
			fs.promises.writeFile(currentFile, current, "utf8"),
			fs.promises.writeFile(baseFile, base, "utf8"),
			fs.promises.writeFile(otherFile, other, "utf8")
		]);
		const result = await spawnGit(dir, [
			"merge-file",
			"-p",
			"B",
			"A",
			"O"
		], process.env, timeoutMs);
		if (result.code !== 0) return {
			ok: false,
			detail: result.stderr.trim() || "git merge-file reported a conflict"
		};
		return {
			ok: true,
			value: normalizeLf(result.stdout)
		};
	} finally {
		fs.rmSync(dir, {
			recursive: true,
			force: true
		});
	}
}
function rebuildAfter(record) {
	if (record.argsRaw === void 0) return {
		ok: false,
		detail: "tool arguments were not captured for this modification"
	};
	let args;
	try {
		args = JSON.parse(record.argsRaw);
	} catch {
		return {
			ok: false,
			detail: "tool arguments are not valid JSON"
		};
	}
	if (typeof args !== "object" || args === null) return {
		ok: false,
		detail: "tool arguments are malformed"
	};
	const value = args;
	if (record.toolName === "write") {
		const content = value.content;
		if (typeof content !== "string") return {
			ok: false,
			detail: "write content argument is unavailable"
		};
		return {
			ok: true,
			value: {
				after: content,
				created: !record.beforeExisted
			}
		};
	}
	const oldString = firstString(value, "old_string", "oldString");
	const newString = firstString(value, "new_string", "newString");
	const replaceAll = firstBoolean(value, "replace_all", "replaceAll") ?? false;
	if (oldString === void 0 || newString === void 0) return {
		ok: false,
		detail: "edit old_string/new_string/replace_all arguments are unavailable"
	};
	const before = record.beforeContent ?? "";
	const matches = countMatches(before, oldString);
	if (matches === 0 || !replaceAll && matches !== 1) return {
		ok: false,
		detail: `edit arguments do not match the captured before-image (${matches} matches)`
	};
	return {
		ok: true,
		value: {
			after: before.split(oldString).join(newString),
			created: false
		}
	};
}
function firstString(value, snake, camel) {
	const candidate = value[snake] ?? value[camel];
	return typeof candidate === "string" ? candidate : void 0;
}
function firstBoolean(value, snake, camel) {
	const candidate = value[snake] ?? value[camel];
	return typeof candidate === "boolean" ? candidate : void 0;
}
function countMatches(text, needle) {
	if (needle === "") return 0;
	let count = 0;
	let index = text.indexOf(needle);
	while (index !== -1) {
		count += 1;
		index = text.indexOf(needle, index + needle.length);
	}
	return count;
}
//#endregion
//#region lib/types/host/providers/ledger-fallback.js
/**
* Ledger fallback provider: ignored tool writes and non-git workspaces.
* Git diff entries win for a path; ledger entries fill the paths git cannot see.
*/
var LedgerProvider = class {
	ctx;
	ledger;
	constructor(ctx, ledger) {
		this.ctx = ctx;
		this.ledger = ledger;
	}
	async mergeChanges(sessionId, turn, cwd, gitChanges, gitAvailable) {
		const warnings = [];
		const ledgerChanges = await this.ledger.buildFileChanges(sessionId, turn, cwd, gitAvailable ? "ignored" : "fallback");
		const byPath = /* @__PURE__ */ new Map();
		for (const change of gitChanges) byPath.set(change.path, change);
		for (const change of ledgerChanges) {
			if (byPath.has(change.path)) continue;
			byPath.set(change.path, change);
		}
		if (!gitAvailable) warnings.push("workspace is not inside a git work tree; only tool write/edit modifications captured by the ledger can be restored");
		return {
			changes: [...byPath.values()],
			warnings
		};
	}
};
//#endregion
//#region lib/types/host/restore.js
var RollbackRestore = class {
	ctx;
	snapshots;
	ledger;
	safety;
	options;
	prepared = /* @__PURE__ */ new Map();
	constructor(ctx, snapshots, ledger, safety, options) {
		this.ctx = ctx;
		this.snapshots = snapshots;
		this.ledger = ledger;
		this.safety = safety;
		this.options = options;
	}
	async prepare(sessionId, messageId) {
		const live = this.liveSession(sessionId);
		if (!live.ok) return live;
		const session = live.value;
		const cwd = session.header.cwd;
		if (cwd === void 0) return fail("session-not-live", `session "${sessionId}" has no workspace cwd`);
		const resolved = resolveBoundary(session, messageId);
		if (resolved.failure !== void 0) return fail(resolved.failure.code, resolved.failure.message, resolved.failure);
		const boundary = resolved.boundary;
		const found = await this.snapshots.find(sessionId, boundary.targetTurn);
		if (found === void 0) return fail("snapshot-unavailable", `no rollback snapshot is available for turn ${boundary.targetTurn}`, {
			sessionId,
			messageId
		});
		const provider = this.snapshots.providerFor(cwd);
		const gitAvailable = await provider.available();
		if (found.manifest.tree !== void 0 && !await this.snapshots.ensureTreeAvailable(found.manifest, provider)) return fail("snapshot-expired", "the snapshot git objects have been garbage collected", {
			sessionId,
			messageId
		});
		const warnings = [...found.degraded ? [`snapshot is from turn ${found.manifest.turn}, before the requested turn ${boundary.targetTurn}`] : []];
		let preparedTree;
		let changes = [];
		if (found.manifest.tree !== void 0 && gitAvailable) {
			preparedTree = await provider.captureTree();
			const entries = await provider.diffEntries(found.manifest.tree, preparedTree);
			for (const entry of entries) {
				if (entry.oldMode === "160000" || entry.newMode === "160000") {
					warnings.push(`nested git repository "${entry.path}" is represented as a gitlink and cannot be restored from this snapshot`);
					continue;
				}
				if (entry.status === "A") {
					changes.push({
						path: entry.path,
						absolutePath: provider.absolutePath(entry.path),
						status: "created",
						source: "git",
						restorable: false,
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
		} else if (found.manifest.tree !== void 0) warnings.push("workspace is no longer inside a git work tree; only ledger-covered paths are shown");
		const merged = await new LedgerProvider(this.ctx, this.ledger).mergeChanges(sessionId, found.manifest.turn, cwd, changes, gitAvailable && found.manifest.tree !== void 0);
		changes = merged.changes;
		warnings.push(...merged.warnings);
		const modifications = this.buildModifications(sessionId, found.manifest.turn, cwd, session.events);
		this.attachToolCalls(changes, modifications);
		const prepareId = crypto.randomUUID();
		const prepared = {
			prepareId,
			sessionId,
			messageId,
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
		if (prepared === void 0 || prepared.sessionId !== request.sessionId || prepared.messageId !== request.messageId) return fail("workspace-changed", "prepare context is missing or does not match this message; run prepare again", {
			sessionId: request.sessionId,
			messageId: request.messageId
		});
		if (request.scope === "modifications" && request.paths !== void 0 && request.paths.length > 0) return fail("rollback-failed", "scope=modifications is mutually exclusive with paths");
		if (request.scope === "files" && request.modificationIds !== void 0 && request.modificationIds.length > 0) return fail("rollback-failed", "scope=files is mutually exclusive with modificationIds");
		const live = this.liveSession(request.sessionId);
		if (!live.ok) return live;
		const session = live.value;
		const provider = this.snapshots.providerFor(prepared.cwd);
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
			if (request.scope === "modifications") return await this.executeModifications(prepared, request, provider, guardTree, affected, () => this.finishGuard(prepared, guardId, journalId));
			const selected = await this.selectFilePaths(prepared, request, provider);
			if (!selected.ok) return selected;
			for (const item of selected.value.all) affected.add(item);
			const ledgerPaths = selected.value.ledger.map((item) => item.rel);
			guardId = (await this.safety.captureGuard(this.ctx, provider, prepared.cwd, guardTree, ledgerPaths, this.ledger)).guardId;
			journalId = (await this.safety.journalStart(guardId, selected.value.all)).id;
			const restored = [];
			const kept = [];
			const deleted = [];
			const skipped = [];
			try {
				const gitRestore = selected.value.git.filter((item) => item.inSnapshot);
				const gitCreated = selected.value.git.filter((item) => !item.inSnapshot);
				await provider.restorePaths(prepared.snapshot.tree ?? "", gitRestore.map((item) => item.rel));
				for (const rel of gitRestore.map((item) => item.rel)) {
					if (await provider.blobHash(prepared.snapshot.tree ?? "", rel) !== await provider.fileHash(rel)) throw new Error(`verification failed for ${rel}`);
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
				for (const item of selected.value.ledger) {
					const baseline = this.ledger.baselineForTurn(request.sessionId, prepared.snapshot.turn, item.abs ?? item.rel);
					if (baseline === void 0) {
						if (request.createdPolicy === "delete") {
							const abs = item.abs ?? provider.absolutePath(item.rel);
							if (fs.existsSync(abs)) {
								fs.rmSync(abs, { force: true });
								deleted.push(item.rel);
							} else skipped.push(item.rel);
						} else kept.push(item.rel);
						continue;
					}
					const outcome = await this.ledger.restoreLedgerPath(prepared.cwd, item.rel, baseline, request.createdPolicy ?? "keep");
					if (outcome === "restored") restored.push(item.rel);
					else if (outcome === "deleted") deleted.push(item.rel);
					else if (outcome === "kept") kept.push(item.rel);
					else skipped.push(item.rel);
				}
				await this.safety.journalUpdate(journalId, "completed");
				return ok({
					guardId,
					restored,
					kept,
					deleted,
					skipped,
					...request.scope === "turn" ? { forkAnchor: prepared.boundary.forkAtSeq } : {}
				});
			} catch (error) {
				await this.safety.rollbackGuard(this.ctx, provider, this.ledger, guardId, selected.value.all).catch(() => void 0);
				await this.safety.journalUpdate(journalId, "rolled-back").catch(() => void 0);
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
			journal: await this.safety.listJournals(cwd),
			...lock === void 0 ? {} : { lock }
		});
	}
	async openAt(sessionId, request) {
		const live = this.liveSession(sessionId);
		if (!live.ok) return live;
		const cwd = live.value.header.cwd;
		if (cwd === void 0) return fail("session-not-live", `session "${sessionId}" has no workspace cwd`);
		const provider = this.snapshots.providerFor(cwd);
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
		const requested = request.scope === "files" && request.paths !== void 0 && request.paths.length > 0 ? request.paths : void 0;
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
		const ledger = [];
		for (const change of changes) {
			const rel = change.path;
			all.push(rel);
			if (change.source === "ledger") {
				ledger.push({
					rel,
					abs: change.absolutePath
				});
				continue;
			}
			let inSnapshot = false;
			if (prepared.snapshot.tree !== void 0) inSnapshot = (await provider.pathsInTree(prepared.snapshot.tree, rel)).includes(rel);
			git.push({
				rel,
				inSnapshot
			});
		}
		return ok({
			all,
			git,
			ledger
		});
	}
	buildModifications(sessionId, turn, cwd, events) {
		const records = this.ledger.listForTurn(sessionId, turn);
		const recorded = new Set(records.map((item) => item.modificationId));
		const result = [];
		for (const event of events) {
			if (event.type !== "tool/call") continue;
			const data = event.data;
			if (data.turn !== turn || data.callId === void 0 || data.name !== "write" && data.name !== "edit") continue;
			if (recorded.has(data.callId)) continue;
			const args = parseRecordArgs(data.arguments);
			const filePath = typeof args.file_path === "string" ? args.file_path : typeof args.filePath === "string" ? args.filePath : void 0;
			if (filePath === void 0) continue;
			const rel = path.relative(cwd, filePath);
			if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) continue;
			const toolResult = events.find((candidate) => candidate.type === "tool/result" && candidate.data.turn === turn && resultEventCallId(candidate) === data.callId);
			result.push({
				modificationId: data.callId,
				toolName: data.name,
				path: rel.split(path.sep).join("/"),
				turn: data.turn ?? turn,
				step: data.step ?? 0,
				seq: event.seq,
				hunks: sessionLogHunks(toolResult, args),
				restorable: "unsupported",
				reason: "no live ledger before-image for this modification"
			});
			recorded.add(data.callId);
		}
		for (const record of records) {
			const rel = path.relative(cwd, record.path);
			if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) continue;
			result.push({
				modificationId: record.modificationId,
				toolName: record.toolName,
				path: rel.split(path.sep).join("/"),
				turn: record.turn,
				step: record.step,
				seq: record.seq,
				hunks: recordHunks(record),
				restorable: record.beforeExisted ? record.beforeContent !== void 0 ? "merge" : "unsupported" : "file-only",
				...record.beforeExisted && record.beforeContent === void 0 ? { reason: "no bounded text before-image" } : {},
				...!record.beforeExisted ? {
					createdFile: true,
					reason: "file was created by this modification; undoing it requires delete confirmation"
				} : {},
				laterModificationIds: this.ledger.laterModifications(sessionId, record.path, record).map((item) => item.modificationId)
			});
		}
		return result;
	}
	attachToolCalls(changes, modifications) {
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
	async executeModifications(prepared, request, provider, guardTree, affected, _finish) {
		const ids = request.modificationIds ?? [];
		if (ids.length === 0) return fail("rollback-failed", "scope=modifications requires modificationIds");
		const selected = ids.map((id) => this.ledger.recordById(request.sessionId, id)).filter((record) => record !== void 0);
		if (selected.length === 0) return fail("rollback-failed", "none of the requested modifications are available", {
			sessionId: request.sessionId,
			messageId: request.messageId
		});
		const byPath = /* @__PURE__ */ new Map();
		for (const record of selected) {
			if (record.turn !== prepared.snapshot.turn) continue;
			const rel = path.relative(prepared.cwd, record.path);
			if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) continue;
			const list = byPath.get(rel) ?? [];
			list.push(record);
			byPath.set(rel, list);
		}
		const paths = [...byPath.keys()];
		for (const item of paths) affected.add(item);
		const guard = await this.safety.captureGuard(this.ctx, provider, prepared.cwd, guardTree, paths, this.ledger);
		const journalId = (await this.safety.journalStart(guard.guardId, paths)).id;
		const results = [];
		const restoredPaths = [];
		try {
			for (const [rel, records] of byPath) {
				records.sort((a, b) => b.seq - a.seq || b.createdAt - a.createdAt);
				const fileGuard = await this.ledger.readCurrentForGuard(prepared.cwd, rel);
				let failed = false;
				for (const record of records) {
					const outcome = await restoreModification(this.ctx, this.ledger, prepared.cwd, record, request.createdPolicy === "delete", this.options.spawnTimeoutMs);
					results.push({
						modificationId: record.modificationId,
						path: rel,
						status: outcome.status,
						...outcome.detail === void 0 ? {} : { detail: outcome.detail }
					});
					if (outcome.status === "conflict" || outcome.status === "failed" || outcome.status === "unsupported") {
						failed = true;
						break;
					}
				}
				if (failed) {
					for (const record of records) {
						const existing = results.find((item) => item.modificationId === record.modificationId);
						if (existing !== void 0 && existing.status === "restored") existing.status = "conflict";
					}
					await this.ledger.restoreGuardFile(prepared.cwd, rel, fileGuard).catch(() => void 0);
				} else restoredPaths.push(rel);
			}
			await this.safety.journalUpdate(journalId, "completed");
			return ok({
				guardId: guard.guardId,
				restored: restoredPaths,
				kept: [],
				deleted: results.filter((item) => item.status === "restored" && item.detail?.includes("deleted")).map((item) => item.path),
				skipped: [],
				modificationResults: results,
				...request.scope === "turn" ? { forkAnchor: prepared.boundary.forkAtSeq } : {}
			});
		} catch (error) {
			await this.safety.rollbackGuard(this.ctx, provider, this.ledger, guard.guardId, paths).catch(() => void 0);
			await this.safety.journalUpdate(journalId, "rolled-back").catch(() => void 0);
			return fail("rollback-failed", String(error), {
				sessionId: request.sessionId,
				messageId: request.messageId,
				paths
			});
		}
	}
	async executeFailure(error, request, prepared, guardId, journalId, affected) {
		const message = error instanceof Error ? error.message : String(error);
		const code = message.includes("workspace lock timeout") ? "lock-timeout" : message.includes("running agent") ? "agent-running" : message.includes("git operation") ? "git-operation-in-progress" : "rollback-failed";
		let guardRolledBack = guardId === "";
		if (guardId !== "" && affected.size > 0) try {
			const provider = this.snapshots.providerFor(prepared.cwd);
			await this.safety.rollbackGuard(this.ctx, provider, this.ledger, guardId, [...affected]);
			guardRolledBack = true;
		} catch {}
		if (journalId !== void 0) await this.safety.journalUpdate(journalId, guardRolledBack ? "rolled-back" : "interrupted").catch(() => void 0);
		return fail(code, message, {
			sessionId: request.sessionId,
			messageId: request.messageId,
			paths: [...affected]
		});
	}
	finishGuard(_prepared, _guardId, _journalId) {}
};
function parseRecordArgs(raw) {
	if (raw === void 0) return {};
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}
function resultEventCallId(event) {
	if (event.type !== "tool/result") return void 0;
	return event.data.message?.source?.callId;
}
function sessionLogHunks(event, args) {
	if (event !== void 0 && event.type === "tool/result") {
		const diffs = event.data.meta?.diffs;
		if (diffs !== void 0 && diffs.length > 0) return diffs.map((item) => ({
			oldText: typeof item.oldText === "string" ? item.oldText : null,
			newText: typeof item.newText === "string" ? item.newText : "",
			...item.path === void 0 ? {} : { path: item.path }
		})).filter((item) => item.newText !== "");
	}
	if (typeof args.content === "string") return [{
		oldText: null,
		newText: args.content
	}];
	const oldString = typeof args.old_string === "string" ? args.old_string : typeof args.oldString === "string" ? args.oldString : void 0;
	const newString = typeof args.new_string === "string" ? args.new_string : typeof args.newString === "string" ? args.newString : "";
	return oldString === void 0 ? [] : [{
		oldText: oldString,
		newText: newString
	}];
}
function recordHunks(record) {
	let args = {};
	if (record.argsRaw !== void 0) try {
		const parsed = JSON.parse(record.argsRaw);
		if (typeof parsed === "object" && parsed !== null) args = parsed;
	} catch {}
	if (record.toolName === "write") {
		const content = typeof args.content === "string" ? args.content : "";
		return wholeFileHunk(record.beforeExisted ? record.beforeContent ?? null : null, content);
	}
	const oldString = typeof args.old_string === "string" ? args.old_string : typeof args.oldString === "string" ? args.oldString : void 0;
	const newString = typeof args.new_string === "string" ? args.new_string : typeof args.newString === "string" ? args.newString : "";
	if (oldString === void 0) return [];
	return [{
		oldText: oldString,
		newText: newString,
		oldLine: 1,
		newLine: 1
	}];
}
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
//#region lib/types/host/safety.js
const GUARDS_FILE = "guards.json";
var RollbackSafety = class {
	options;
	lock;
	lockFile;
	journals = [];
	guards = /* @__PURE__ */ new Map();
	journalsLoaded = false;
	writeTail = Promise.resolve();
	constructor(options) {
		this.options = options;
	}
	get ledgerDir() {
		return this.options.ledgerDir;
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
	async captureGuard(ctx, provider, cwd, tree, ledgerPaths, ledger) {
		const ledgerFiles = [];
		for (const rel of [...new Set(ledgerPaths)]) {
			const current = await ledger.readCurrentForGuard(cwd, rel);
			ledgerFiles.push({
				path: rel,
				existed: current.existed,
				...current.version === void 0 ? {} : { version: current.version },
				...current.size === void 0 ? {} : { size: current.size },
				...current.content === void 0 ? {} : { content: current.content }
			});
		}
		const guardId = `guard-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
		const record = {
			...tree === void 0 ? {} : { tree },
			ledgerFiles,
			cwd
		};
		this.guards.set(guardId, record);
		await this.persistGuards();
		return {
			guardId,
			record
		};
	}
	async journalStart(guardId, paths) {
		await this.loadJournals();
		const entry = {
			id: `journal-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
			phase: "running",
			paths: [...new Set(paths)],
			guardId,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		this.journals.unshift(entry);
		await this.persistJournals();
		return entry;
	}
	async journalUpdate(id, phase) {
		await this.loadJournals();
		const entry = this.journals.find((item) => item.id === id);
		if (entry === void 0) return;
		entry.phase = phase;
		entry.updatedAt = Date.now();
		await this.persistJournals();
	}
	async listJournals(cwd) {
		await this.loadJournals();
		return this.journals.filter((entry) => this.guards.get(entry.guardId ?? "")?.cwd === path.resolve(cwd));
	}
	async rollbackGuard(ctx, provider, ledger, guardId, paths) {
		const guard = this.guards.get(guardId);
		if (guard === void 0) throw new Error(`guard ${guardId} is no longer available`);
		const gitPaths = paths.filter((item) => provider.isWithin(item));
		const ledgerPaths = paths.filter((item) => !provider.isWithin(item) || guard.ledgerFiles.some((file) => file.path === item));
		if (guard.tree !== void 0 && gitPaths.length > 0) await provider.restorePaths(guard.tree, gitPaths);
		for (const rel of [...new Set(ledgerPaths)]) {
			const file = guard.ledgerFiles.find((item) => item.path === rel);
			if (file !== void 0) await ledger.restoreGuardFile(guard.cwd, rel, file);
		}
	}
	async loadGuards() {
		const raw = await readJsonFile(path.join(this.ledgerDir, GUARDS_FILE), {});
		for (const [id, value] of Object.entries(raw)) if (typeof value === "object" && value !== null && Array.isArray(value.ledgerFiles)) this.guards.set(id, value);
	}
	async persistGuards() {
		const raw = Object.fromEntries(this.guards);
		this.writeTail = this.writeTail.catch(() => void 0).then(async () => writeJsonFileAtomic(path.join(this.ledgerDir, GUARDS_FILE), raw)).catch(() => void 0);
	}
	async loadJournals() {
		if (this.journalsLoaded) return;
		this.journalsLoaded = true;
		const loaded = await readJsonFile(journalsPath(), []);
		this.journals.splice(0, this.journals.length, ...loaded);
	}
	async persistJournals() {
		this.writeTail = this.writeTail.catch(() => void 0).then(async () => writeJsonFileAtomic(journalsPath(), this.journals)).catch(() => void 0);
	}
	/** Reconcile journals left in `running` by a dead owner at startup. */
	async reconcileRunning(ctx, snapshots, ledger) {
		await this.loadGuards();
		await this.loadJournals();
		for (const entry of this.journals) {
			if (entry.phase !== "running" || entry.guardId === void 0) continue;
			const guard = this.guards.get(entry.guardId);
			if (guard === void 0) {
				await this.journalUpdate(entry.id, "interrupted");
				continue;
			}
			const lock = await this.readLock(guard.cwd);
			if (lock !== void 0 && isAlive(lock.ownerPid) && Date.now() - lock.createdAt <= this.options.lockStaleMs) continue;
			try {
				const provider = snapshots.providerFor(guard.cwd);
				await this.rollbackGuard(ctx, provider, ledger, entry.guardId, entry.paths);
				await this.journalUpdate(entry.id, "rolled-back");
			} catch (error) {
				ctx.logger.warn(`rollback reconciliation failed for journal ${entry.id}:`, error);
				await this.journalUpdate(entry.id, "interrupted");
			}
		}
	}
	async isStale(file) {
		const lock = readLock(file);
		if (lock === void 0) return true;
		if (!isAlive(lock.ownerPid)) return true;
		return Date.now() - lock.createdAt > this.options.lockStaleMs;
	}
};
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
	ledgerMaxTextBytes: 256 * 1024,
	maxLedgerRecordsPerSession: 500,
	maxSnapshotsPerSession: 200,
	maxDiffHunksPerFile: 20,
	maxDiffBytesPerFile: 256 * 1024,
	restoreChunkSize: 64,
	guardRetentionMs: 720 * 60 * 60 * 1e3,
	lockStaleMs: 600 * 1e3,
	spawnTimeoutMs: 60 * 1e3
};
let RollbackService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _prepare_decorators;
	let _execute_decorators;
	let _openAt_decorators;
	let _status_decorators;
	return class RollbackService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_prepare_decorators = [Remote];
			_execute_decorators = [Remote];
			_openAt_decorators = [Remote];
			_status_decorators = [Remote];
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
		ledger;
		safety;
		restore;
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
			this.ledger = new ChangeLedger(this.host, {
				ledgerMaxTextBytes: this.config.ledgerMaxTextBytes,
				maxLedgerRecordsPerSession: this.config.maxLedgerRecordsPerSession
			});
			this.safety = new RollbackSafety({
				lockStaleMs: this.config.lockStaleMs,
				guardRetentionMs: this.config.guardRetentionMs,
				ledgerDir,
				lockTimeoutMs: 1e4
			});
			this.restore = new RollbackRestore(this.host, this.snapshots, this.ledger, this.safety, {
				maxDiffHunksPerFile: this.config.maxDiffHunksPerFile,
				maxDiffBytesPerFile: this.config.maxDiffBytesPerFile,
				restoreChunkSize: this.config.restoreChunkSize,
				spawnTimeoutMs: this.config.spawnTimeoutMs
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
		schema: { parse(value) {
			return value;
		} }
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
				codec: jsonCodec("dsh-rollback-plugin#JsonValue")
			}
		], true),
		invocation("status", [{
			name: "sessionId",
			wire: "sessionId",
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
	const typert = ctx.typert;
	if (typert !== void 0) ctx.effect(() => typert.register(ROLLBACK_HOST_TYPERT), "rollback: typert host contribution");
	else host.logger.warn("rollback: typert service unavailable; Remote methods may use the SRC fallback");
	ctx.on("agent/pre-step", async (payload, next) => {
		if (payload.step === 1 && service.config.snapshotOnPreStep) try {
			await service.snapshots.capture(payload.agent.session, payload.turn);
		} catch (error) {
			host.logger.warn("rollback snapshot skipped:", error);
		}
		return next();
	}, { prepend: true });
	installLedgerListeners(ctx, service);
	service.safety.reconcileRunning(host, service.snapshots, service.ledger).catch((error) => {
		host.logger.warn("rollback startup reconciliation skipped:", error);
	});
}
function installLedgerListeners(ctx, service) {
	const host = ctx;
	ctx.on("fs/write-intent", (target, actor, next) => {
		return service.ledger.captureWriteBefore(target, actor, next);
	}, { prepend: true });
	ctx.on("fs/edit-intent", (target, actor, next) => {
		return service.ledger.captureEditBefore(target, actor, next);
	}, { prepend: true });
	ctx.on("fs/observed", (target, observation, actor) => {
		try {
			service.ledger.observe(target, observation, actor);
		} catch (error) {
			host.logger.warn("rollback ledger observation failed:", error);
		}
	});
}
//#endregion
export { ChangeLedger, DEFAULT_ROLLBACK_CONFIG, GitProvider, RollbackService, SnapshotManager, apply, boundaryInfo, buildFileChange, changeLedgerRoot, findPreviousTurnEnd, inject, installLedgerListeners, isHash, journalsPath, ledgerRecordsPath, locksDir, manifestsPath, mergeFiles, name, normalizeLf, parseDiffHunks, parseDiffTreeZ, readJsonFile, resolveBoundary, resolveDshHome, restoreModification, sessionTurnPosition, spawnGit, wholeFileHunk, writeJsonFileAtomic };

//# sourceMappingURL=index.js.map