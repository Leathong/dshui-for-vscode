import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
const HEX_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const RUNNING_OPS = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG'];
export function isHash(value) {
    return HEX_RE.test(value);
}
export function spawnGit(cwd, args, env, timeoutMs, signal, gitDir, workTree) {
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
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
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
        this.baseEnv = env;
    }
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
        const index = await this.createTempIndex();
        try {
            const reset = await this.run(['read-tree', '--empty'], signal, index);
            if (reset.code !== 0)
                throw new Error(`git read-tree --empty failed: ${reset.stderr.trim()}`);
            const added = await this.run(['add', '-A'], signal, index);
            if (added.code !== 0)
                throw new Error(`git add -A failed: ${added.stderr.trim()}`);
            const ledgerRel = this.ledgerRelativePath();
            if (ledgerRel !== undefined) {
                const removed = await this.run(['rm', '-r', '--cached', '--ignore-unmatch', '--quiet', '--', ledgerRel], signal, index);
                if (removed.code !== 0 && removed.stderr.trim() !== '') {
                    throw new Error(`git rm (ledger exclusion) failed: ${removed.stderr.trim()}`);
                }
            }
            const result = await this.run(['write-tree'], signal, index);
            if (result.code !== 0)
                throw new Error(`git write-tree failed: ${result.stderr.trim()}`);
            const tree = result.stdout.trim();
            if (!isHash(tree))
                throw new Error(`git write-tree returned invalid tree hash: ${tree}`);
            return tree;
        }
        finally {
            fs.rmSync(index, { force: true });
            fs.rmSync(path.dirname(index), { recursive: true, force: true });
        }
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
    /** All snapshot object operations run against the isolated repo. */
    async run(args, signal, indexFile) {
        const ready = await this.ensureIsolated(signal);
        if (!ready) {
            return { code: 128, stdout: '', stderr: 'rollback: isolated snapshot repository is unavailable' };
        }
        const env = indexFile === undefined ? this.baseEnv : { ...this.baseEnv, GIT_INDEX_FILE: indexFile };
        return spawnGit(this.cwd, args, env, this.options.spawnTimeoutMs, signal, this.options.isolatedRepoDir, this.cwd);
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
    ledgerRelativePath() {
        const ledger = this.options.ledgerDir;
        if (ledger === undefined || ledger === '')
            return undefined;
        const abs = path.resolve(ledger);
        const rel = path.relative(this.cwd, abs);
        if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`))
            return undefined;
        return rel.split(path.sep).join('/');
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
function diffGitPath(line) {
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
