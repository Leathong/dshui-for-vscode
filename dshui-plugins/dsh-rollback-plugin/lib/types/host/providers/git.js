import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
const HEX_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const ZERO_SHA = '0000000000000000000000000000000000000000';
const RUNNING_OPS = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG'];
export function isHash(value) {
    return HEX_RE.test(value);
}
export function spawnGit(cwd, args, env, timeoutMs, signal, gitDir, workTree, input) {
    const flags = [];
    if (gitDir !== undefined && gitDir !== '')
        flags.push(`--git-dir=${gitDir}`);
    if (workTree !== undefined && workTree !== '')
        flags.push(`--work-tree=${workTree}`);
    return new Promise((resolve, reject) => {
        const child = spawn('git', ['-C', cwd, ...flags, ...args], {
            env: {
                ...env,
                GIT_TERMINAL_PROMPT: '0',
                GIT_OPTIONAL_LOCKS: '0',
                LC_ALL: 'C',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        child.stdin.end(input ?? '');
        let stderr = '';
        let settled = false;
        const chunks = [];
        const onStdout = (chunk) => { chunks.push(chunk); };
        const onStderr = (chunk) => { stderr += chunk.toString('utf8'); };
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill('SIGKILL');
            reject(new Error(`git ${args[0] ?? ''} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        const abort = () => {
            if (settled)
                return;
            settled = true;
            child.kill('SIGKILL');
            reject(new Error(`git ${args[0] ?? ''} aborted`));
        };
        if (signal !== undefined) {
            if (signal.aborted) {
                abort();
                return;
            }
            signal.addEventListener('abort', abort, { once: true });
        }
        child.stdout.on('data', onStdout);
        child.stderr.on('data', onStderr);
        child.on('error', (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            reject(error);
        });
        child.on('close', (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            resolve({ code: code ?? -1, stdout: Buffer.concat(chunks).toString('utf8'), stderr });
        });
    });
}
export class GitProvider {
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
        if (this.isolatedReady !== undefined)
            return this.isolatedReady;
        const ready = await this.ensureIsolated(signal);
        if (ready) {
            try {
                if (!fs.statSync(this.cwd).isDirectory()) {
                    this.isolatedReady = false;
                    return false;
                }
            }
            catch {
                this.isolatedReady = false;
                return false;
            }
        }
        return ready;
    }
    /** Lazily create (idempotent) the session's isolated bare snapshot repo. */
    async ensureIsolated(signal) {
        const dir = this.options.isolatedRepoDir;
        if (dir === undefined || dir === '')
            return false;
        if (this.isolatedReady !== undefined)
            return this.isolatedReady;
        const init = this.options.isolatedRepoInit;
        if (init !== undefined) {
            this.isolatedReady = await init.catch(() => false);
        }
        else {
            try {
                const result = await spawnGit(this.cwd, ['init', '--bare', '--quiet', dir], this.baseEnv, this.options.spawnTimeoutMs, signal);
                this.isolatedReady = result.code === 0;
            }
            catch {
                this.isolatedReady = false;
            }
        }
        return this.isolatedReady;
    }
    /**
     * The project HEAD, for snapshot metadata only (read-only query of the
     * project's own repo; absent in non-git workspaces).
     */
    async head(signal) {
        const result = await this.runProject(['rev-parse', '--verify', 'HEAD'], signal);
        if (result.code !== 0 || !isHash(result.stdout.trim()))
            return undefined;
        return result.stdout.trim();
    }
    /** Snapshot the entire worktree into a temporary-index tree object. */
    async captureTree(signal) {
        const info = await this.captureTreeInfo(signal);
        return info.tree;
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
        const seen = new Set();
        let budget = 0;
        let materialized = false;
        const scanIndex = this.indexPath('scan');
        const materialize = async (absRoot) => {
            // The workspace root reuses the persistent scan index so its stat cache
            // survives between turn snapshots; nested roots always use a temp index.
            const isRoot = path.resolve(absRoot) === path.resolve(this.cwd);
            const tree = await this.captureWorktree(absRoot, signal, isRoot ? scanIndex : undefined);
            const replacements = [];
            for (const rel of await this.gitlinkPaths(tree)) {
                if (budget >= this.maxNestedRepos)
                    break;
                const abs = path.resolve(absRoot, rel);
                const real = await fs.promises.realpath(abs).catch(() => abs);
                if (seen.has(real))
                    continue;
                seen.add(real);
                // A gitlink may point at anything; only recurse when it really is a
                // repository (also covers gitlinks the discovery walk might miss).
                const probe = await spawnGit(abs, ['rev-parse', '--absolute-git-dir'], this.baseEnv, this.options.spawnTimeoutMs).catch(() => undefined);
                if (probe === undefined || probe.code !== 0)
                    continue;
                budget += 1;
                const subTree = await materialize(abs).catch(() => undefined);
                if (subTree !== undefined) {
                    replacements.push({ path: rel, tree: subTree });
                    materialized = true;
                }
            }
            return replacements.length > 0 ? await this.replaceGitlinks(tree, replacements, signal) : tree;
        };
        const tree = await materialize(this.cwd);
        return { tree, materialized };
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
        const MAX_VISITS = 1_000_000;
        let visits = 0;
        const hasGitEntry = async (abs) => {
            try {
                const stat = await fs.promises.lstat(path.join(abs, '.git'));
                return stat.isDirectory() || stat.isFile();
            }
            catch {
                return false;
            }
        };
        const walk = async (current) => {
            if (visits >= MAX_VISITS)
                return;
            let entries = [];
            try {
                entries = await fs.promises.readdir(current, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                if (visits >= MAX_VISITS)
                    return;
                visits += 1;
                if (entry.name === '.git' || !entry.isDirectory())
                    continue;
                const abs = path.join(current, entry.name);
                if (!(await hasGitEntry(abs))) {
                    await walk(abs);
                    continue;
                }
                const result = await spawnGit(abs, ['rev-parse', '--absolute-git-dir'], this.baseEnv, this.options.spawnTimeoutMs).catch(() => undefined);
                if (result === undefined || result.code !== 0)
                    continue;
                const info = {
                    root: abs,
                    gitDir: path.resolve(abs, result.stdout.trim()),
                    rel: path.relative(dir, abs).split(path.sep).join('/'),
                };
                if (accept !== undefined && !(await accept(info)))
                    continue;
                await walk(abs);
                found.push(info);
            }
        };
        try {
            await walk(dir);
        }
        catch {
            // Discovery failure: the caller labels nothing as nested.
        }
        return found;
    }
    /** Workspace-relative gitlink paths stored in a tree snapshot. */
    async gitlinkPaths(tree) {
        if (!isHash(tree))
            return [];
        const listing = await this.run(['ls-tree', '-r', '-z', tree]).catch(() => undefined);
        if (listing === undefined || listing.code !== 0)
            return [];
        const paths = [];
        for (const record of listing.stdout.split('\0')) {
            if (record === '')
                continue;
            const parts = record.split('\t');
            const meta = parts[0] ?? '';
            const filePath = parts[1];
            if (filePath !== undefined && meta.split(' ')[0] === '160000')
                paths.push(filePath);
        }
        return paths;
    }
    /** Capture one worktree (the workspace root or a nested repository root). */
    async captureWorktree(cwd, signal, reuseIndex) {
        const isRoot = path.resolve(cwd) === path.resolve(this.cwd);
        const ownsIndex = reuseIndex === undefined;
        const index = reuseIndex ?? await this.createTempIndex();
        try {
            if (ownsIndex) {
                // A fresh index starts empty; a reused (persistent) one keeps its stat
                // cache, which is what makes the next `add -A` incremental.
                const reset = await this.runAt(cwd, ['read-tree', '--empty'], signal, index);
                if (reset.code !== 0)
                    throw new Error(`git read-tree --empty failed: ${reset.stderr.trim()}`);
            }
            let added = await this.runAt(cwd, ['add', '-A'], signal, index);
            if (added.code !== 0) {
                // Git refuses to index a nested repository with no commit checked
                // out. Find such directories by filesystem walk (no stderr parsing)
                // and retry once with them excluded, so the rest of the tree keeps
                // its snapshot. Their contents are not captured per call.
                const excludes = [];
                for (const repo of await this.scanNestedRepos(cwd).catch(() => [])) {
                    if (!(await this.hasHead(repo.root)))
                        excludes.push(`:(exclude)${repo.rel}/`);
                }
                if (excludes.length > 0) {
                    added = await this.runAt(cwd, ['add', '-A', '--', ...excludes], signal, index);
                }
            }
            if (added.code !== 0)
                throw new Error(`git add -A failed: ${added.stderr.trim()}`);
            const result = await this.runAt(cwd, ['write-tree'], signal, index);
            if (result.code !== 0)
                throw new Error(`git write-tree failed: ${result.stderr.trim()}`);
            const tree = result.stdout.trim();
            if (!isHash(tree))
                throw new Error(`git write-tree returned invalid tree hash: ${tree}`);
            return tree;
        }
        finally {
            if (ownsIndex) {
                fs.rmSync(index, { force: true });
                fs.rmSync(path.dirname(index), { recursive: true, force: true });
            }
        }
    }
    /** Whether a repository has a resolvable HEAD (false ⇒ commitless/bare). */
    async hasHead(root) {
        const result = await spawnGit(root, ['rev-parse', '--verify', '-q', 'HEAD'], this.baseEnv, this.options.spawnTimeoutMs).catch(() => undefined);
        return result !== undefined && result.code === 0;
    }
    /** Replace gitlink records by directory trees (materialization) via a throwaway index. */
    async replaceGitlinks(tree, entries, signal) {
        if (entries.length === 0)
            return tree;
        const index = await this.createTempIndex();
        try {
            const reset = await this.run(['read-tree', '--empty'], signal, index);
            if (reset.code !== 0)
                return tree;
            const populated = await this.run(['read-tree', tree], signal, index);
            if (populated.code !== 0)
                return tree;
            for (const entry of entries) {
                // Drop the gitlink at the exact path (may be absent when the nested
                // repo was excluded during capture, e.g. a commitless child).
                await this.run(['update-index', '--force-remove', '--', entry.path], signal, index);
                const spliced = await this.run(['read-tree', '--prefix', `${entry.path}/`, entry.tree], signal, index);
                if (spliced.code !== 0)
                    return tree;
            }
            const written = await this.run(['write-tree'], signal, index);
            if (written.code !== 0)
                return tree;
            const out = written.stdout.trim();
            return isHash(out) ? out : tree;
        }
        finally {
            fs.rmSync(index, { force: true });
            fs.rmSync(path.dirname(index), { recursive: true, force: true });
        }
    }
    /** Run git against the isolated repo from an arbitrary worktree. */
    async runAt(cwd, args, signal, indexFile) {
        const ready = await this.ensureIsolated(signal);
        if (!ready) {
            return { code: 128, stdout: '', stderr: 'rollback: isolated snapshot repository is unavailable' };
        }
        const env = indexFile === undefined ? this.baseEnv : { ...this.baseEnv, GIT_INDEX_FILE: indexFile };
        return spawnGit(cwd, args, env, this.options.spawnTimeoutMs, signal, this.options.isolatedRepoDir, cwd);
    }
    async treeExists(tree, signal) {
        if (!isHash(tree))
            return false;
        const result = await this.run(['cat-file', '-e', `${tree}^{tree}`], signal);
        return result.code === 0;
    }
    async diffEntries(from, to, signal) {
        if (!isHash(from) || !isHash(to))
            throw new Error('diff-trees requires valid tree hashes');
        const result = await this.run(['diff-tree', '-r', '--no-renames', '-z', from, to], signal);
        if (result.code !== 0)
            throw new Error(`git diff-tree failed: ${result.stderr.trim()}`);
        return parseDiffTreeZ(result.stdout);
    }
    async diffHunks(from, to, filePath, signal) {
        this.assertSafeRelPath(filePath);
        const result = await this.run(['diff-tree', '-p', '-U3', '--no-renames', from, to, '--', filePath], signal);
        if (result.code !== 0)
            throw new Error(`git diff-tree -p failed: ${result.stderr.trim()}`);
        return parseDiffHunks(result.stdout, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile);
    }
    /**
     * Diff hunks for many paths in a single git process. `paths` must be
     * sorted; sections come back in the same order (git tree traversal is
     * lexicographic). Returns a map missing entries for any path whose section
     * is absent or out of order — the caller then falls back to per-file diffs.
     */
    async diffHunksBatched(from, to, paths, signal) {
        if (paths.length === 0)
            return new Map();
        for (const rel of paths)
            this.assertSafeRelPath(rel);
        const result = await this.run(['diff-tree', '-p', '-U3', '--no-renames', from, to, '--', ...paths], signal);
        if (result.code !== 0)
            throw new Error(`git diff-tree -p failed: ${result.stderr.trim()}`);
        return splitDiffByPath(result.stdout, paths, this.options.maxDiffHunksPerFile, this.options.maxDiffBytesPerFile);
    }
    async pathsInTree(tree, relPath, signal) {
        if (!isHash(tree))
            throw new Error('ls-tree requires a valid tree hash');
        const args = ['ls-tree', '-r', '--name-only', '-z', tree];
        if (relPath !== undefined && relPath !== '') {
            this.assertSafeRelPath(relPath);
            args.push('--', relPath);
        }
        const result = await this.run(args, signal);
        if (result.code !== 0)
            return [];
        return result.stdout.split('\0').filter(Boolean);
    }
    async blobHash(tree, relPath, signal) {
        this.assertSafeRelPath(relPath);
        const result = await this.run(['rev-parse', '--verify', `${tree}:${relPath}`], signal);
        if (result.code !== 0)
            return undefined;
        const hash = result.stdout.trim();
        return isHash(hash) ? hash : undefined;
    }
    async fileHash(relPath, signal) {
        this.assertSafeRelPath(relPath);
        if (!fs.existsSync(path.resolve(this.cwd, relPath)))
            return undefined;
        const result = await this.run(['hash-object', '--', relPath], signal);
        if (result.code !== 0)
            return undefined;
        const hash = result.stdout.trim();
        return isHash(hash) ? hash : undefined;
    }
    // --- git-native state primitives (docs/git-only-plan.md §1, §2) ---
    //
    // The ref/tree model keeps every bookmark in git itself: `accepted` (accept
    // baseline), `points/*` (rollback points), `head` (the per-call chain),
    // `guards/*` and `journals/*`. Queries are tree diffs, writes are forward
    // restores or forward index applications — never reverse patches.
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
        }
        finally {
            fs.rmSync(index, { force: true });
            fs.rmSync(path.dirname(index), { recursive: true, force: true });
        }
    }
    /**
     * A persistent index file inside the isolated repo. `scan` backs the
     * full-worktree `add -A` (its stat cache must survive between captures).
     * Use `withScratch` for every other index need.
     */
    indexPath(kind) {
        const dir = this.options.isolatedRepoDir;
        if (dir === undefined || dir === '')
            return undefined;
        return path.join(dir, kind === 'scan' ? 'dsh-scan.index' : 'dsh-scratch.index');
    }
    /**
     * Write a worktree file into the isolated object store and return its blob
     * hash. `undefined` when the path is absent or unreadable, which the caller
     * records as a deletion.
     */
    async writeBlob(absPath, signal) {
        if (!path.isAbsolute(absPath) || absPath.includes('\0'))
            return undefined;
        try {
            if (!fs.statSync(absPath).isFile())
                return undefined;
        }
        catch {
            return undefined;
        }
        const result = await this.run(['hash-object', '-w', '--', absPath], signal);
        if (result.code !== 0)
            return undefined;
        const hash = result.stdout.trim();
        return isHash(hash) ? hash : undefined;
    }
    /** `write-tree` from an explicit index file. */
    async writeTree(indexFile, signal) {
        const result = await this.run(['write-tree'], signal, indexFile);
        if (result.code !== 0)
            throw new Error(`git write-tree failed: ${result.stderr.trim()}`);
        const tree = result.stdout.trim();
        if (!isHash(tree))
            throw new Error(`git write-tree returned invalid tree hash: ${tree}`);
        return tree;
    }
    /** Reset an index file to a tree-ish (`read-tree`; `--empty` when omitted). */
    async readTree(indexFile, treeish, signal) {
        const args = treeish === undefined || treeish === ''
            ? ['read-tree', '--empty']
            : ['read-tree', treeish];
        const result = await this.run(args, signal, indexFile);
        if (result.code !== 0)
            throw new Error(`git read-tree failed: ${result.stderr.trim()}`);
    }
    /**
     * Register many index entries in a single git process (`update-index
     * --index-info`). An entry without `blob` removes the path.
     */
    async updateIndexInfo(indexFile, entries, signal) {
        if (entries.length === 0)
            return;
        const batchable = entries.every(entry => !/[\n\t]/.test(entry.path));
        if (batchable) {
            const lines = entries.map(entry => entry.blob === undefined
                ? `0 ${ZERO_SHA}\t${entry.path}\n`
                : `${entry.mode ?? '100644'} ${entry.blob}\t${entry.path}\n`).join('');
            const result = await this.run(['update-index', '--index-info'], signal, indexFile, undefined, lines);
            if (result.code !== 0)
                throw new Error(`git update-index --index-info failed: ${result.stderr.trim()}`);
            return;
        }
        for (const entry of entries) {
            const args = entry.blob === undefined
                ? ['update-index', '--force-remove', '--', entry.path]
                : ['update-index', '--add', '--cacheinfo', `${entry.mode ?? '100644'},${entry.blob},${entry.path}`];
            const result = await this.run(args, signal, indexFile);
            if (result.code !== 0)
                throw new Error(`git update-index failed for ${entry.path}: ${result.stderr.trim()}`);
        }
    }
    /**
     * Apply a patch to an index only (never the worktree). The caller follows
     * with `checkoutIndex` to materialize the result. This is the forward-only
     * primitive behind hunk undo and patch replay.
     */
    async applyCached(indexFile, patch, options = {}, signal) {
        if (patch.trim() === '')
            return { ok: true, stderr: '' };
        const args = ['apply', '--cached', '--whitespace=nowarn'];
        if (options.unidiffZero === true)
            args.push('--unidiff-zero');
        if (options.threeWay === true)
            args.push('--3way');
        const result = await this.run(args, signal, indexFile, undefined, patch);
        return { ok: result.code === 0, stderr: result.stderr.trim() };
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
                if (fs.statSync(path.resolve(this.cwd, rel)).isFile())
                    existing.push(rel);
            }
            catch {
                // Deleted paths need no staging: the index already reflects the base.
            }
        }
        if (existing.length === 0)
            return;
        const chunkSize = Math.max(1, this.options.restoreChunkSize);
        for (let start = 0; start < existing.length; start += chunkSize) {
            const chunk = existing.slice(start, start + chunkSize);
            const result = await this.run(['add', '-f', '--', ...chunk], signal, indexFile);
            if (result.code !== 0)
                throw new Error(`git add -f failed for ${chunk.join(', ')}: ${result.stderr.trim()}`);
        }
    }
    /** Write index entries from an index file into the worktree. */
    async checkoutIndex(indexFile, relPaths, signal) {
        const unique = [...new Set(relPaths.map(item => this.normalizeRelPath(item)))];
        if (unique.length === 0)
            return;
        const chunkSize = Math.max(1, this.options.restoreChunkSize);
        for (let start = 0; start < unique.length; start += chunkSize) {
            const chunk = unique.slice(start, start + chunkSize);
            const result = await this.run(['checkout-index', '-f', '--', ...chunk], signal, indexFile);
            if (result.code !== 0) {
                throw new Error(`git checkout-index failed for ${chunk.join(', ')}: ${result.stderr.trim()}`);
            }
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
        for (const rel of relPaths)
            this.assertSafeRelPath(rel);
        const args = ['diff', '--no-renames', '--full-index', `--unified=${Math.max(0, options.context ?? 3)}`, from];
        if (to !== undefined && to !== '')
            args.push(to);
        if (relPaths.length > 0)
            args.push('--', ...relPaths);
        const result = await this.run(args, options.signal, options.indexFile);
        if (result.code !== 0)
            throw new Error(`git diff failed: ${result.stderr.trim()}`);
        return result.stdout;
    }
    /**
     * Per-commit patches for many commits in one process: each commit hash on
     * stdin produces its own diff against its first parent, prefixed by a line
     * containing the commit hash. This is the batched form of the per-call patch
     * list (docs/git-only-plan.md §3).
     */
    async diffTreePatches(commits, options = {}) {
        const result = new Map();
        const hashes = commits.filter(commit => isHash(commit));
        if (hashes.length === 0)
            return result;
        const run = await this.run(['diff-tree', '-p', '--no-renames', '--full-index', `--unified=${Math.max(0, options.context ?? 3)}`, '--stdin'], options.signal, undefined, undefined, `${hashes.join('\n')}\n`);
        if (run.code !== 0)
            throw new Error(`git diff-tree --stdin failed: ${run.stderr.trim()}`);
        let current;
        let lines = [];
        const flush = () => {
            if (current !== undefined)
                result.set(current, lines.join('\n'));
            lines = [];
        };
        for (const line of run.stdout.split('\n')) {
            if (isHash(line)) {
                flush();
                current = line;
                continue;
            }
            if (current !== undefined)
                lines.push(line);
        }
        flush();
        return result;
    }
    /** Create a commit object for a tree (no worktree or index involved). */ async commitTree(tree, parents, message, options = {}, signal) {
        if (!isHash(tree))
            throw new Error('commit-tree requires a valid tree hash');
        const ready = await this.ensureIsolated(signal);
        if (!ready)
            throw new Error('rollback: isolated snapshot repository is unavailable');
        const when = Math.floor((options.timestamp ?? Date.now()) / 1000);
        const env = {
            ...this.baseEnv,
            GIT_AUTHOR_NAME: 'dsh',
            GIT_AUTHOR_EMAIL: 'dsh@local',
            GIT_COMMITTER_NAME: 'dsh',
            GIT_COMMITTER_EMAIL: 'dsh@local',
            GIT_AUTHOR_DATE: `${when} +0000`,
            GIT_COMMITTER_DATE: `${when} +0000`,
        };
        const args = ['commit-tree', tree];
        for (const parent of parents) {
            if (isHash(parent))
                args.push('-p', parent);
        }
        const result = await spawnGit(this.cwd, args, env, this.options.spawnTimeoutMs, signal, this.options.isolatedRepoDir, undefined, message);
        if (result.code !== 0)
            throw new Error(`git commit-tree failed: ${result.stderr.trim()}`);
        const commit = result.stdout.trim();
        if (!isHash(commit))
            throw new Error(`git commit-tree returned invalid hash: ${commit}`);
        return commit;
    }
    /** Resolve a ref to its object hash, or undefined when it does not exist. */
    async readRef(ref, signal) {
        const result = await this.run(['rev-parse', '--verify', '--quiet', ref], signal);
        if (result.code !== 0)
            return undefined;
        const hash = result.stdout.trim();
        return isHash(hash) ? hash : undefined;
    }
    /**
     * Move a ref. With `expectedOld` this is a compare-and-swap: the update
     * fails (returns false) unless the ref currently points at `expectedOld`,
     * which makes concurrent accepts safe without a lock.
     */
    async updateRef(ref, sha, expectedOld, signal) {
        if (!isHash(sha))
            throw new Error('update-ref requires a valid object hash');
        const args = ['update-ref', ref, sha];
        if (expectedOld !== undefined)
            args.push(expectedOld);
        const result = await this.run(args, signal);
        return result.code === 0;
    }
    /** Refs under a prefix, in refname order. */
    async listRefs(prefix, signal) {
        const result = await this.run(['for-each-ref', '--format=%(refname)%00%(objectname)', prefix], signal);
        if (result.code !== 0)
            return [];
        const out = [];
        for (const line of result.stdout.split('\n')) {
            if (line === '')
                continue;
            const [ref, sha] = line.split('\0');
            if (ref === undefined || sha === undefined || !isHash(sha))
                continue;
            out.push({ ref, sha });
        }
        return out;
    }
    /**
     * Refs under a prefix with their commit messages in the same process
     * (`for-each-ref --format=…%(contents)`), used by the ref-backed journal.
     */
    async listRefsDetailed(prefix, signal) {
        const result = await this.run(['for-each-ref', '--format=%(refname)%00%(objectname)%00%(contents)', prefix], signal);
        if (result.code !== 0)
            return [];
        const out = [];
        for (const line of result.stdout.split('\n')) {
            if (line === '')
                continue;
            const parts = line.split('\0');
            const ref = parts[0];
            const sha = parts[1];
            if (ref === undefined || sha === undefined || !isHash(sha))
                continue;
            out.push({ ref, sha, contents: parts.slice(2).join('\0') });
        }
        return out;
    }
    /**
     * Refs under a prefix with commit metadata in one process: refname, object
     * hash, tree hash, committer time and message. Backs the turn-point list.
     */
    async listRefsWithMeta(prefix, signal) {
        const result = await this.run(['for-each-ref', '--format=%(refname)%00%(objectname)%00%(tree)%00%(creatordate:unix)%00%(contents)', prefix], signal);
        if (result.code !== 0)
            return [];
        const out = [];
        for (const line of result.stdout.split('\n')) {
            if (line === '')
                continue;
            const parts = line.split('\0');
            const ref = parts[0];
            const sha = parts[1];
            if (ref === undefined || sha === undefined || !isHash(sha))
                continue;
            out.push({
                ref,
                sha,
                tree: (parts[2] ?? '').trim(),
                createdAt: Number(parts[3] ?? '0') || 0,
                contents: parts.slice(4).join('\0'),
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
        if (!isHash(rev))
            return [];
        const result = await this.run(['rev-list', '--max-parents=0', rev], signal);
        if (result.code !== 0)
            return [];
        return result.stdout.split('\n').map(line => line.trim()).filter(isHash);
    }
    /** The tree hash a revision points at (`rev-parse <rev>^{tree}`). */
    async treeOf(rev, signal) {
        const result = await this.run(['rev-parse', '--verify', `${rev}^{tree}`], signal);
        const tree = result.stdout.trim();
        if (result.code !== 0 || !isHash(tree))
            throw new Error(`git rev-parse ${rev}^{tree} failed: ${result.stderr.trim()}`);
        return tree;
    }
    /** Delete a ref (best-effort; missing refs are not an error). */
    async deleteRefs(refs, signal) {
        if (refs.length === 0)
            return;
        await this.run(['update-ref', '--stdin'], signal, undefined, undefined, refs.map(ref => `delete ${ref}\n`).join(''));
    }
    /**
     * Build any number of commits in one process. The caller assembles the
     * fast-import stream; blobs must already exist in the isolated repo (see
     * `writeBlob`), so this is the freeze step of the per-call chain.
     */
    async fastImport(stream, signal) {
        if (stream.trim() === '')
            return;
        const ready = await this.ensureIsolated(signal);
        if (!ready)
            throw new Error('rollback: isolated snapshot repository is unavailable');
        const payload = stream.endsWith('\n') ? stream : `${stream}\n`;
        const result = await spawnGit(this.cwd, ['fast-import', '--quiet'], this.baseEnv, this.options.spawnTimeoutMs, signal, this.options.isolatedRepoDir, undefined, payload);
        if (result.code !== 0)
            throw new Error(`git fast-import failed: ${result.stderr.trim()}`);
    }
    async restorePaths(tree, relPaths, signal) {
        if (!isHash(tree))
            throw new Error('restore requires a valid tree hash');
        const unique = [...new Set(relPaths.map(item => this.normalizeRelPath(item)))];
        if (unique.length === 0)
            return;
        // A pathspec must match an index entry. Populating a throwaway index from
        // the snapshot tree lets restore recreate files that are untracked in the
        // default index while leaving the default index itself untouched.
        const index = await this.createTempIndex();
        try {
            const reset = await this.run(['read-tree', '--empty'], signal, index);
            if (reset.code !== 0)
                throw new Error(`git read-tree --empty failed: ${reset.stderr.trim()}`);
            const populated = await this.run(['read-tree', tree], signal, index);
            if (populated.code !== 0)
                throw new Error(`git read-tree ${tree} failed: ${populated.stderr.trim()}`);
            const chunkSize = Math.max(1, this.options.restoreChunkSize);
            for (let start = 0; start < unique.length; start += chunkSize) {
                const chunk = unique.slice(start, start + chunkSize);
                const result = await this.run(['restore', '--worktree', `--source=${tree}`, '--', ...chunk], signal, index);
                if (result.code !== 0) {
                    throw new Error(`git restore failed for ${chunk.join(', ')}: ${result.stderr.trim()}`);
                }
            }
        }
        finally {
            fs.rmSync(index, { force: true });
            fs.rmSync(path.dirname(index), { recursive: true, force: true });
        }
    }
    async assertNoGitOperation(signal) {
        const dir = await this.resolveProjectGitDir(signal);
        if (dir === undefined)
            return false;
        for (const marker of RUNNING_OPS) {
            if (fs.existsSync(path.join(dir, marker)))
                return true;
        }
        for (const sub of ['rebase-merge', 'rebase-apply']) {
            if (fs.existsSync(path.join(dir, sub)))
                return true;
        }
        return false;
    }
    /** Every snapshot object operation runs against the isolated repo. */
    async run(args, signal, indexFile, _unused, input) {
        const ready = await this.ensureIsolated(signal);
        if (!ready) {
            return { code: 128, stdout: '', stderr: 'rollback: isolated snapshot repository is unavailable' };
        }
        const env = indexFile === undefined
            ? this.baseEnv
            : { ...this.baseEnv, GIT_INDEX_FILE: indexFile };
        return spawnGit(this.cwd, args, env, this.options.spawnTimeoutMs, signal, this.options.isolatedRepoDir, this.cwd, input);
    }
    /** Read-only queries against the project's own repo (head, fences). */
    async runProject(args, signal) {
        return spawnGit(this.cwd, args, this.baseEnv, this.options.spawnTimeoutMs, signal);
    }
    /** The project's git dir (`.git`), or undefined outside a git worktree. */
    async resolveProjectGitDir(signal) {
        if (this.projectGitDir != null)
            return this.projectGitDir;
        this.projectGitDir = null;
        const result = await this.runProject(['rev-parse', '--absolute-git-dir'], signal);
        if (result.code === 0) {
            const out = result.stdout.trim();
            if (out !== '' && out !== '.')
                this.projectGitDir = path.resolve(this.cwd, out);
        }
        return this.projectGitDir ?? undefined;
    }
    normalizeRelPath(input) {
        this.assertSafeRelPath(input);
        const abs = path.resolve(this.cwd, input);
        return path.relative(this.cwd, abs).split(path.sep).join('/');
    }
    isWithin(input) {
        try {
            this.assertSafeRelPath(input);
            return true;
        }
        catch {
            return false;
        }
    }
    assertSafeRelPath(input) {
        if (typeof input !== 'string' || input.length === 0)
            throw new Error('path must be a non-empty string');
        if (input.includes('\0'))
            throw new Error('path must not contain NUL');
        if (path.isAbsolute(input))
            throw new Error(`path must be relative to the workspace: ${input}`);
        const abs = path.resolve(this.cwd, input);
        const rel = path.relative(this.cwd, abs);
        if (rel === '..' || rel.startsWith(`..${path.sep}`)) {
            throw new Error(`path escapes the workspace: ${input}`);
        }
    }
    absolutePath(relPath) {
        return path.resolve(this.cwd, this.normalizeRelPath(relPath));
    }
    async createTempIndex() {
        const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-rollback-index-'));
        return path.join(dir, 'index');
    }
}
export function parseDiffTreeZ(stdout) {
    const parts = stdout.split('\0');
    const entries = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
        const meta = parts[i] ?? '';
        const file = parts[i + 1] ?? '';
        if (file === '')
            continue;
        const status = meta.slice(-1);
        if (status !== 'A' && status !== 'M' && status !== 'D' && status !== 'T')
            continue;
        const fields = meta.slice(1).split(' ');
        entries.push({
            path: file,
            status,
            oldMode: fields[0] ?? '',
            newMode: fields[1] ?? '',
            oldHash: fields[2] ?? '',
            newHash: fields[3] ?? '',
        });
    }
    return entries;
}
export function parseDiffHunks(stdout, maxHunks, maxBytes) {
    if (stdout.includes('Binary files ') && stdout.includes(' differ')) {
        return { hunks: [], truncated: false, binary: true };
    }
    const lines = stdout.split(/\r?\n/);
    const hunks = [];
    let truncated = false;
    let bytes = 0;
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? '';
        if (!line.startsWith('@@ '))
            continue;
        const parsed = parseHunkHeader(line);
        if (parsed === undefined)
            continue;
        const oldLines = [];
        const newLines = [];
        // Offsets (in body lines) of the first changed line on each side; the
        // hunk header line number marks the start of the context region, so the
        // buttons must anchor on the first line that actually differs.
        let firstOld;
        let firstNew;
        let oldBefore = 0;
        let newBefore = 0;
        for (i += 1; i < lines.length; i += 1) {
            const body = lines[i] ?? '';
            if (body === '\\ No newline at end of file')
                continue;
            if (body.startsWith('@@ ')) {
                i -= 1;
                break;
            }
            if (body.startsWith('--- ') || body.startsWith('+++ '))
                continue;
            if (body.startsWith(' ')) {
                const text = body.slice(1);
                oldLines.push(text);
                newLines.push(text);
                oldBefore += 1;
                newBefore += 1;
            }
            else if (body.startsWith('-')) {
                // A deleted line anchors the old side at itself and the new side at
                // the deletion boundary — without this, pure-deletion hunks (e.g. a
                // removed blank line) would fall back to the hunk's context prefix.
                if (firstOld === undefined)
                    firstOld = oldBefore;
                if (firstNew === undefined)
                    firstNew = newBefore;
                oldLines.push(body.slice(1));
                oldBefore += 1;
            }
            else if (body.startsWith('+')) {
                // Symmetrically, an added line anchors the new side at itself and the
                // old side at the insertion boundary.
                if (firstNew === undefined)
                    firstNew = newBefore;
                if (firstOld === undefined)
                    firstOld = oldBefore;
                newLines.push(body.slice(1));
                newBefore += 1;
            }
        }
        const oldText = oldLines.join('\n');
        const newText = newLines.join('\n');
        bytes += Buffer.byteLength(newText, 'utf8');
        if (hunks.length >= maxHunks || bytes > maxBytes) {
            truncated = true;
            break;
        }
        hunks.push({
            oldText,
            newText,
            ...(parsed.oldLine === undefined ? {} : { oldLine: parsed.oldLine }),
            ...(parsed.newLine === undefined ? {} : { newLine: parsed.newLine }),
            ...(parsed.endLine === undefined ? {} : { endLine: parsed.endLine }),
            ...(firstOld === undefined || parsed.oldLine === undefined ? {} : { firstChangedOldLine: parsed.oldLine + firstOld }),
            ...(firstNew === undefined || parsed.newLine === undefined ? {} : { firstChangedNewLine: parsed.newLine + firstNew }),
        });
    }
    return { hunks, truncated, binary: false };
}
function parseHunkHeader(line) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (match === null)
        return undefined;
    const newLine = Number(match[3]);
    const newCount = match[4] === undefined ? 1 : Number(match[4]);
    const oldLine = Number(match[1]);
    if (newCount > 0)
        return { oldLine, newLine, endLine: newLine + newCount - 1 };
    return { oldLine, newLine };
}
/** Split a multi-file `git diff-tree -p` stream into per-file sections. */
export function splitDiffSections(stdout) {
    const lines = stdout.split('\n');
    const sections = [];
    let current = [];
    for (const line of lines) {
        if (line.startsWith('diff --git ')) {
            if (current.length > 0) {
                sections.push(current.join('\n'));
                current = [];
            }
            current.push(line);
        }
        else if (current.length > 0) {
            current.push(line);
        }
    }
    if (current.length > 0)
        sections.push(current.join('\n'));
    return sections;
}
/** Parse the path out of a `diff --git a/x b/x` section header (quoted or not). */
export function diffGitPath(line) {
    const rest = line.slice('diff --git '.length);
    if (!rest.startsWith('"')) {
        const match = /^a\/(\S+) b\//.exec(rest);
        return match === null ? undefined : match[1];
    }
    const match = /^"a\/((?:[^"\\]|\\.)*)" "b\//.exec(rest);
    return match === null ? undefined : unquoteGitPath(match[1] ?? '');
}
/** Undo git's C-style path quoting (core.quotePath). */
export function unquoteGitPath(quoted) {
    let out = '';
    for (let i = 0; i < quoted.length; i += 1) {
        const ch = quoted[i];
        if (ch !== '\\') {
            out += ch;
            continue;
        }
        const next = quoted[i + 1];
        if (next === undefined)
            break;
        if (next === 'n')
            out += '\n';
        else if (next === 't')
            out += '\t';
        else if (next === 'r')
            out += '\r';
        else if (next === 'a')
            out += '\a';
        else if (next === 'b')
            out += '\b';
        else if (next === 'f')
            out += '\f';
        else if (next === 'v')
            out += '\v';
        else if (next === '"')
            out += '"';
        else if (next === '\\')
            out += '\\';
        else if (next >= '0' && next <= '7') {
            let octal = next;
            let j = i + 2;
            while (octal.length < 3 && j < quoted.length && quoted[j] >= '0' && quoted[j] <= '7') {
                octal += quoted[j];
                j += 1;
            }
            out += String.fromCharCode(parseInt(octal, 8));
            i = j - 1;
        }
        else {
            out += next;
        }
        i += 1;
    }
    return out;
}
/**
 * Map a batched diff stream to per-path parse results. `sortedPaths` must be
 * sorted like the stream; a section count or order mismatch returns a map
 * missing the affected entries so the caller can fall back per file.
 */
export function splitDiffByPath(stdout, sortedPaths, maxHunks, maxBytes) {
    const result = new Map();
    const sections = splitDiffSections(stdout);
    if (sections.length !== sortedPaths.length)
        return result;
    for (let i = 0; i < sections.length; i += 1) {
        const expected = sortedPaths[i];
        const header = sections[i].split('\n')[0] ?? '';
        const parsedPath = diffGitPath(header);
        if (parsedPath !== undefined && parsedPath !== expected)
            return result;
        result.set(expected, parseDiffHunks(sections[i], maxHunks, maxBytes));
    }
    return result;
}
export function buildFileChange(cwd, entry, hunks, truncated, binary) {
    const status = entry.status === 'A' ? 'created'
        : entry.status === 'D' ? 'deleted'
            : entry.status === 'T' ? 'typechange'
                : binary ? 'binary'
                    : 'modified';
    const nested = entry.newMode === '160000' || entry.oldMode === '160000';
    return {
        path: entry.path,
        absolutePath: path.resolve(cwd, entry.path),
        status: nested ? 'nested-repo' : status,
        source: 'git',
        restorable: entry.status !== 'A' && !nested,
        ...(entry.status === 'A' ? { createdAfterSnapshot: true } : {}),
        ...(binary ? { binary: true } : {}),
        ...(truncated ? { truncated: true } : {}),
        ...(hunks.length > 0 ? { hunks } : {}),
    };
}
