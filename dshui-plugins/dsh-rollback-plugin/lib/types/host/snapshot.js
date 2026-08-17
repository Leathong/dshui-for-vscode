import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitProvider } from "./providers/git.js";
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
export class SnapshotManager {
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
            ledgerDir: this.options.ledgerDir,
        });
    }
    /** Capture the pre-step baseline. Failures are caught by the caller and never block the agent. */
    async capture(session, turn) {
        const cwd = session.header.cwd;
        if (cwd === undefined || cwd === '')
            return undefined;
        await this.load();
        if (this.manifests.some(item => item.sessionId === session.id && item.turn === turn))
            return undefined;
        const provider = this.providerFor(cwd);
        const head = await provider.head().catch(() => undefined);
        let tree;
        let mode = 'ledger';
        if (await provider.available().catch(() => false)) {
            tree = await provider.captureTree().catch(error => {
                // Keep this turn usable through the ledger fallback instead of failing the agent.
                return undefined;
            });
            if (tree !== undefined)
                mode = 'git';
            if (tree === undefined) {
                // Re-attempt without the ledger-exclusion path; useful when the status dir is unusual.
                tree = await provider.captureTree().catch(() => undefined);
                if (tree !== undefined)
                    mode = 'git';
            }
        }
        if (tree === undefined)
            mode = 'ledger';
        const manifest = {
            snapshotId: `${session.id}:${turn}:${Date.now().toString(36)}`,
            sessionId: session.id,
            turn,
            cwd,
            ...(tree === undefined ? {} : { tree }),
            ...(head === undefined ? {} : { head }),
            createdAt: Date.now(),
            mode,
            ...(turnStartSeq(session, turn) === undefined ? {} : { turnStartSeq: turnStartSeq(session, turn) }),
        };
        const next = this.manifests
            .filter(item => !(item.sessionId === session.id && item.turn === turn));
        next.push(manifest);
        this.enqueuePersist(trimManifests(next, this.options.maxSnapshotsPerSession));
        return manifest;
    }
    /** Exact snapshot first, then the newest earlier snapshot for the same session. */
    async find(sessionId, targetTurn) {
        await this.load();
        const exact = this.manifests
            .filter(item => item.sessionId === sessionId && item.turn === targetTurn)
            .sort((a, b) => b.createdAt - a.createdAt)[0];
        if (exact !== undefined)
            return { manifest: exact, degraded: false };
        const earlier = this.manifests
            .filter(item => item.sessionId === sessionId && item.turn < targetTurn)
            .sort((a, b) => b.turn - a.turn || b.createdAt - a.createdAt)[0];
        if (earlier === undefined)
            return undefined;
        return { manifest: earlier, degraded: true };
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
    async listForSession(sessionId) {
        await this.load();
        return this.manifests
            .filter(item => item.sessionId === sessionId)
            .sort((a, b) => b.turn - a.turn || b.createdAt - a.createdAt);
    }
    /** All manifests captured in one workspace (any session), oldest first. */
    async listForWorkspace(cwd) {
        await this.load();
        const resolved = path.resolve(cwd);
        return this.manifests
            .filter(item => path.resolve(item.cwd) === resolved)
            .sort((a, b) => a.createdAt - b.createdAt || a.snapshotId.localeCompare(b.snapshotId));
    }
    async load() {
        if (this.loaded)
            return;
        this.loaded = true;
        const store = await this.domainStore();
        if (store !== undefined) {
            this.manifests = await store.read();
            return;
        }
        this.manifests = await readJsonFile(manifestsPath(), []);
    }
    enqueuePersist(next) {
        this.manifests = next;
        this.writeTail = this.writeTail
            .catch(() => undefined)
            .then(async () => {
            const store = await this.domainStore();
            if (store !== undefined)
                await store.write(this.manifests);
            await writeJsonFileAtomic(manifestsPath(), this.manifests);
        })
            .catch(() => undefined);
    }
    /** Open the storage-domain table when the Host composition provides one. */
    domainStore() {
        this.domainStorePromise ??= this.openDomainStore().catch((error) => {
            if (this.ctx !== undefined)
                this.ctx.logger.warn('rollback: storage-domain unavailable, using JSON manifests:', error);
            return undefined;
        });
        return this.domainStorePromise;
    }
    async openDomainStore() {
        if (this.ctx === undefined)
            return undefined;
        const facility = this.ctx.get('storageDomain');
        if (facility === undefined || typeof facility.open !== 'function')
            return undefined;
        const [domainModule, schemaModule] = await Promise.all([
            import('@deepseek-ai/dsh-storage-domain'),
            import('@deepseek-ai/schemastery'),
        ]);
        const z = schemaModule.default;
        const spec = domainModule.defineDomain({
            name: 'rollback',
            version: 1,
            tables: {
                manifests: domainModule.domainTable(z.any()),
            },
        });
        const domain = await facility.open(spec);
        const table = domain.table('manifests');
        return {
            read: async () => {
                const value = table.get('manifests');
                return Array.isArray(value?.items) ? value.items : [];
            },
            write: async (value) => table.put('manifests', { items: value }),
        };
    }
}
function trimManifests(manifests, maxPerSession) {
    const bySession = new Map();
    for (const manifest of manifests) {
        const list = bySession.get(manifest.sessionId) ?? [];
        list.push(manifest);
        bySession.set(manifest.sessionId, list);
    }
    const result = [];
    for (const list of bySession.values())
        result.push(...list.slice(-maxPerSession));
    return result;
}
function turnStartSeq(session, turn) {
    const event = session.events.find(item => item.type === 'turn/start' && item.data.turn === turn);
    return event?.seq;
}
