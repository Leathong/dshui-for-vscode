import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitProvider, spawnGit } from "./providers/git.js";
/**
 * Encode an arbitrary string as one filesystem-safe path segment, mirroring
 * the JSONL session persistence layout (`@deepseek-ai/dsh-session-persistence-jsonl`):
 * safe code units stay literal, everything else becomes `~XXXX`.
 */
export function encodeSessionSegment(raw) {
    if (raw === '.')
        return '~002E';
    if (raw === '..')
        return '~002E~002E';
    let out = '';
    for (let i = 0; i < raw.length; i += 1) {
        const code = raw.charCodeAt(i);
        const ch = String.fromCharCode(code);
        if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch))
            out += ch;
        else
            out += `~${code.toString(16).toUpperCase().padStart(4, '0')}`;
    }
    return out;
}
/**
 * The readable per-project directory key, mirroring the JSONL persistence
 * layout: separators become `-`, unsafe units `~XXXX`, bounded and wrapped
 * in `--…--`.
 */
export function projectDirKey(cwd) {
    let readable = '';
    let separatorRun = false;
    for (let i = 0; i < cwd.length; i += 1) {
        const code = cwd.charCodeAt(i);
        const ch = String.fromCharCode(code);
        if (ch === '/' || ch === '\\' || ch === ':') {
            if (!separatorRun)
                readable += '-';
            separatorRun = true;
        }
        else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
            readable += ch;
            separatorRun = false;
        }
        else {
            readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`;
            separatorRun = false;
        }
    }
    return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`;
}
/**
 * The on-disk directory DSH owns for one session, mirroring the JSONL
 * persistence backend: `<DSH_HOME>/sessions/<projectKey(cwd)>/<sessionId>`.
 * Session-local artifacts placed here are removed together with the session.
 */
export function sessionDirFor(dshHome, cwd, sessionId) {
    const project = cwd === undefined || cwd === '' ? '_no-cwd' : projectDirKey(cwd);
    return path.join(dshHome, 'sessions', project, encodeSessionSegment(sessionId));
}
/** The isolated bare snapshot repo for one session, inside its session dir. */
export function sessionSnapshotRepo(dshHome, cwd, sessionId) {
    return path.join(sessionDirFor(dshHome, cwd, sessionId), 'rollback.git');
}
export function resolveDshHome() {
    const configured = process.env.DSH_HOME;
    return configured !== undefined && configured !== '' ? configured : path.join(os.homedir(), '.dsh');
}
export function changeLedgerRoot() {
    return path.join(resolveDshHome(), 'change-ledger');
}
export function manifestsPath() {
    return path.join(changeLedgerRoot(), 'v1', 'manifests.json');
}
export function journalsPath() {
    return path.join(changeLedgerRoot(), 'v1', 'journals.json');
}
export function locksDir() {
    return path.join(changeLedgerRoot(), 'locks');
}
export async function readJsonFile(file, fallback) {
    try {
        const raw = await fs.promises.readFile(file, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch {
        return fallback;
    }
}
export async function writeJsonFileAtomic(file, value) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.promises.rename(tmp, file);
}
export const POINTS_PREFIX = 'refs/dsh/points/';
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
export class SnapshotManager {
    options;
    ctx;
    /** In-memory manifests for the current process (never persisted). */
    manifests = new Map();
    dshHome;
    /** In-flight isolated repo inits, keyed by repo dir (dedupe across providers). */
    isolatedInit = new Map();
    constructor(options, ctx) {
        this.options = options;
        this.ctx = ctx;
        this.dshHome = options.dshHome ?? resolveDshHome();
    }
    get ledgerDir() {
        return this.options.ledgerDir;
    }
    /**
     * Provider bound to one session's isolated snapshot repo (kept inside the
     * session's own directory, so deleting the session removes the objects).
     */
    providerFor(cwd, sessionId) {
        const isolatedRepoDir = sessionId === undefined || sessionId === ''
            ? undefined
            : sessionSnapshotRepo(this.dshHome, cwd, sessionId);
        const isolatedRepoInit = isolatedRepoDir === undefined ? undefined : this.ensureIsolatedRepo(isolatedRepoDir);
        return new GitProvider(cwd, {
            spawnTimeoutMs: this.options.spawnTimeoutMs,
            maxDiffHunksPerFile: this.options.maxDiffHunksPerFile,
            maxDiffBytesPerFile: this.options.maxDiffBytesPerFile,
            restoreChunkSize: this.options.restoreChunkSize,
            isolatedRepoDir,
            isolatedRepoInit,
        });
    }
    ensureIsolatedRepo(dir) {
        const existing = this.isolatedInit.get(dir);
        if (existing !== undefined)
            return existing;
        const init = spawnGit(process.cwd(), ['init', '--bare', '--quiet', dir], process.env, this.options.spawnTimeoutMs).then(result => result.code === 0).catch(() => false);
        this.isolatedInit.set(dir, init);
        // Failed inits are forgotten so a later call can retry.
        void init.then(ok => { if (!ok)
            this.isolatedInit.delete(dir); });
        return init;
    }
    /** Capture the turn-start point. Failures never block the agent. */
    async capture(session, turn) {
        const cwd = session.header.cwd;
        if (cwd === undefined || cwd === '')
            return undefined;
        const provider = this.providerFor(cwd, session.id);
        if (!(await provider.available().catch(() => false)))
            return undefined;
        const ref = pointRef(turn);
        const existing = await provider.readRef(ref);
        if (existing !== undefined)
            return this.manifestAt(cwd, session.id, turn, provider);
        // `captureTreeInfo` reuses the provider's persistent scan index for the
        // workspace root (warm stat cache) and materializes nested repositories.
        const captured = await provider.captureTreeInfo().catch(() => undefined);
        const tree = captured?.tree;
        const materialized = captured?.materialized ?? false;
        if (tree === undefined)
            return undefined;
        const message = [
            'turn point',
            `session=${session.id}`,
            `turn=${turn}`,
            `cwd=${cwd}`,
            `created=${Date.now()}`,
            '',
        ].join('\n');
        const commit = await provider.commitTree(tree, [], message);
        if (!(await provider.updateRef(ref, commit)))
            return undefined;
        await this.prune(cwd, session.id, provider);
        const manifest = {
            snapshotId: `${session.id}:${turn}:${commit.slice(0, 8)}`,
            sessionId: session.id,
            turn,
            cwd,
            tree,
            createdAt: Date.now(),
            mode: 'git',
            ...(materialized ? { materialized: true } : {}),
        };
        const list = this.manifests.get(session.id) ?? [];
        this.manifests.set(session.id, [...list.filter(item => item.turn !== turn), manifest]);
        return manifest;
    }
    /** Exact point first, then the newest earlier point for the same session. */
    async find(cwd, sessionId, targetTurn) {
        const provider = this.providerFor(cwd, sessionId);
        if (!(await provider.available().catch(() => false)))
            return undefined;
        const exact = await this.manifestAt(cwd, sessionId, targetTurn, provider);
        if (exact !== undefined)
            return { manifest: exact, degraded: false };
        const points = await this.listPoints(cwd, sessionId, provider);
        const earlier = points.filter(item => item.turn < targetTurn).sort((a, b) => b.turn - a.turn)[0];
        if (earlier === undefined)
            return undefined;
        return { manifest: earlier, degraded: true };
    }
    async listPoints(cwd, sessionId, provider = this.providerFor(cwd, sessionId)) {
        const refs = await provider.listRefsWithMeta(POINTS_PREFIX).catch(() => []);
        return refs.map(entry => {
            const turn = Number(entry.ref.slice(POINTS_PREFIX.length)) || 0;
            const manifest = {
                snapshotId: `${sessionId}:${turn}:${entry.sha.slice(0, 8)}`,
                sessionId,
                turn,
                cwd,
                ...(entry.tree === '' ? {} : { tree: entry.tree }),
                createdAt: entry.createdAt > 0 ? entry.createdAt * 1000 : Date.now(),
                mode: 'git',
            };
            return manifest;
        }).sort((a, b) => a.turn - b.turn);
    }
    async ensureTreeAvailable(manifest, provider) {
        if (manifest.tree === undefined)
            return true;
        return provider.treeExists(manifest.tree);
    }
    snapshotInfo(manifest, degraded) {
        return {
            id: manifest.snapshotId,
            turn: manifest.turn,
            createdAt: manifest.createdAt,
            ...(degraded ? { degraded: true } : {}),
        };
    }
    /** Drop the oldest points beyond `maxSnapshotsPerSession`. */
    async prune(cwd, sessionId, provider) {
        const points = await this.listPoints(cwd, sessionId, provider);
        const overflow = points.length - Math.max(1, this.options.maxSnapshotsPerSession);
        if (overflow <= 0)
            return;
        await provider.deleteRefs(points.slice(0, overflow).map(item => pointRef(item.turn)));
    }
    async manifestAt(cwd, sessionId, turn, provider) {
        const commit = await provider.readRef(pointRef(turn));
        if (commit === undefined)
            return undefined;
        const tree = await provider.treeOf(commit).catch(() => undefined);
        return {
            snapshotId: `${sessionId}:${turn}:${commit.slice(0, 8)}`,
            sessionId,
            turn,
            cwd,
            ...(tree === undefined ? {} : { tree }),
            createdAt: Date.now(),
            mode: 'git',
        };
    }
}
/** `refs/dsh/points/<nnnn>`: zero padded so ref order equals turn order. */
export function pointRef(turn) {
    return `${POINTS_PREFIX}${String(Math.max(0, Math.trunc(turn))).padStart(4, '0')}`;
}
