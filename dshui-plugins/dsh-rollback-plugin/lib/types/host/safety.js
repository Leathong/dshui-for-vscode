import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sandboxPolicyForCwd } from "./fs-policy.js";
import { journalsPath, locksDir, readJsonFile, writeJsonFileAtomic } from "./snapshot.js";
const GUARDS_FILE = 'guards.json';
export class RollbackSafety {
    options;
    lock;
    lockFile;
    journals = [];
    guards = new Map();
    journalsLoaded = false;
    writeTail = Promise.resolve();
    constructor(options) {
        this.options = options;
    }
    get ledgerDir() {
        return this.options.ledgerDir;
    }
    hashWorkspace(cwd) {
        return crypto.createHash('sha256').update(path.resolve(cwd)).digest('hex').slice(0, 24);
    }
    async acquire(cwd) {
        if (this.lock !== undefined)
            return;
        const file = path.join(locksDir(), `${this.hashWorkspace(cwd)}.lock`);
        const nonce = crypto.randomUUID();
        const deadline = Date.now() + this.options.lockTimeoutMs;
        for (;;) {
            try {
                fs.mkdirSync(locksDir(), { recursive: true });
                const fd = fs.openSync(file, 'wx');
                const lock = { ownerPid: process.pid, nonce, createdAt: Date.now() };
                fs.writeFileSync(fd, JSON.stringify(lock));
                fs.closeSync(fd);
                this.lock = lock;
                this.lockFile = file;
                return;
            }
            catch (error) {
                if (error.code !== 'EEXIST')
                    throw error;
                const stale = await this.isStale(file);
                if (stale) {
                    fs.rmSync(file, { force: true });
                    continue;
                }
                if (Date.now() >= deadline) {
                    throw new Error(`rollback workspace lock timeout: ${file}`);
                }
                await delay(40);
            }
        }
    }
    async release() {
        if (this.lockFile === undefined)
            return;
        try {
            if (this.lock !== undefined && readLock(this.lockFile)?.nonce === this.lock.nonce) {
                fs.rmSync(this.lockFile, { force: true });
            }
        }
        finally {
            this.lock = undefined;
            this.lockFile = undefined;
        }
    }
    async readLock(cwd) {
        return readLock(path.join(locksDir(), `${this.hashWorkspace(cwd)}.lock`));
    }
    async assertFences(ctx, cwd, provider) {
        const running = ctx.agents.list().find(agent => {
            if (agent.status !== 'running')
                return false;
            return agent.session.header.cwd !== undefined && path.resolve(agent.session.header.cwd) === path.resolve(cwd);
        });
        if (running !== undefined) {
            throw new Error('a running agent shares this workspace; wait for it to become idle');
        }
        if (await provider.assertNoGitOperation()) {
            throw new Error('a git operation (merge/rebase/cherry-pick/…) is in progress');
        }
    }
    async captureGuard(ctx, provider, cwd, tree, ledgerPaths, ledger, sessionId) {
        const ledgerFiles = [];
        for (const rel of [...new Set(ledgerPaths)]) {
            const current = await ledger.readCurrentForGuard(cwd, rel);
            ledgerFiles.push({
                path: rel,
                existed: current.existed,
                ...(current.version === undefined ? {} : { version: current.version }),
                ...(current.size === undefined ? {} : { size: current.size }),
                ...(current.content === undefined ? {} : { content: current.content }),
            });
        }
        const guardId = `guard-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
        const record = {
            ...(tree === undefined ? {} : { tree }),
            ledgerFiles,
            cwd,
            ...(sessionId === undefined || sessionId === '' ? {} : { sessionId }),
        };
        this.guards.set(guardId, record);
        await this.persistGuards();
        return { guardId, record };
    }
    async journalStart(guardId, paths) {
        await this.loadJournals();
        const entry = {
            id: `journal-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
            phase: 'running',
            paths: [...new Set(paths)],
            guardId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.journals.unshift(entry);
        await this.persistJournals();
        return entry;
    }
    async journalUpdate(id, phase) {
        await this.loadJournals();
        const entry = this.journals.find(item => item.id === id);
        if (entry === undefined)
            return;
        entry.phase = phase;
        entry.updatedAt = Date.now();
        await this.persistJournals();
    }
    async listJournals(cwd) {
        await this.loadJournals();
        return this.journals.filter(entry => this.guards.get(entry.guardId ?? '')?.cwd === path.resolve(cwd));
    }
    async rollbackGuard(ctx, provider, ledger, guardId, paths, sandboxPolicy) {
        const guard = this.guards.get(guardId);
        if (guard === undefined)
            throw new Error(`guard ${guardId} is no longer available`);
        const gitPaths = paths.filter(item => provider.isWithin(item));
        const ledgerPaths = paths.filter(item => !provider.isWithin(item) || guard.ledgerFiles.some(file => file.path === item));
        if (guard.tree !== undefined && gitPaths.length > 0) {
            await provider.restorePaths(guard.tree, gitPaths);
        }
        for (const rel of [...new Set(ledgerPaths)]) {
            const file = guard.ledgerFiles.find(item => item.path === rel);
            if (file !== undefined)
                await ledger.restoreGuardFile(guard.cwd, rel, file, sandboxPolicy);
        }
    }
    async loadGuards() {
        const raw = await readJsonFile(path.join(this.ledgerDir, GUARDS_FILE), {});
        for (const [id, value] of Object.entries(raw)) {
            if (typeof value === 'object' && value !== null && Array.isArray(value.ledgerFiles))
                this.guards.set(id, value);
        }
    }
    async persistGuards() {
        const raw = Object.fromEntries(this.guards);
        this.writeTail = this.writeTail
            .catch(() => undefined)
            .then(async () => writeJsonFileAtomic(path.join(this.ledgerDir, GUARDS_FILE), raw))
            .catch(() => undefined);
    }
    async loadJournals() {
        if (this.journalsLoaded)
            return;
        this.journalsLoaded = true;
        const loaded = await readJsonFile(journalsPath(), []);
        this.journals.splice(0, this.journals.length, ...loaded);
    }
    async persistJournals() {
        this.writeTail = this.writeTail
            .catch(() => undefined)
            .then(async () => writeJsonFileAtomic(journalsPath(), this.journals))
            .catch(() => undefined);
    }
    /** Reconcile journals left in `running` by a dead owner at startup. */
    async reconcileRunning(ctx, snapshots, ledger) {
        await this.loadGuards();
        await this.loadJournals();
        for (const entry of this.journals) {
            if (entry.phase !== 'running' || entry.guardId === undefined)
                continue;
            const guard = this.guards.get(entry.guardId);
            if (guard === undefined) {
                await this.journalUpdate(entry.id, 'interrupted');
                continue;
            }
            const lock = await this.readLock(guard.cwd);
            if (lock !== undefined && isAlive(lock.ownerPid) && Date.now() - lock.createdAt <= this.options.lockStaleMs)
                continue;
            try {
                if (guard.sessionId === undefined || guard.sessionId === '') {
                    // Pre-isolation guards have no isolated repo; their tree objects may
                    // live in the project repo and are not resolvable here.
                    ctx.logger.warn(`rollback: journal ${entry.id} has no session id; marking interrupted`);
                    await this.journalUpdate(entry.id, 'interrupted');
                    continue;
                }
                const provider = snapshots.providerFor(guard.cwd, guard.sessionId);
                await this.rollbackGuard(ctx, provider, ledger, entry.guardId, entry.paths, sandboxPolicyForCwd(guard.cwd));
                await this.journalUpdate(entry.id, 'rolled-back');
            }
            catch (error) {
                ctx.logger.warn(`rollback reconciliation failed for journal ${entry.id}:`, error);
                await this.journalUpdate(entry.id, 'interrupted');
            }
        }
    }
    async isStale(file) {
        const lock = readLock(file);
        if (lock === undefined)
            return true;
        if (!isAlive(lock.ownerPid))
            return true;
        return Date.now() - lock.createdAt > this.options.lockStaleMs;
    }
}
function readLock(file) {
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof parsed.ownerPid !== 'number' || typeof parsed.nonce !== 'string' || typeof parsed.createdAt !== 'number')
            return undefined;
        return parsed;
    }
    catch {
        return undefined;
    }
}
function isAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
