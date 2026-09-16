import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CHAIN_HEAD_REF } from "./tracking.js";
import { locksDir } from "./snapshot.js";
export const GUARDS_PREFIX = 'refs/dsh/guards/';
export const JOURNALS_PREFIX = 'refs/dsh/journals/';
export class RollbackSafety {
    options;
    lock;
    lockFile;
    constructor(options) {
        this.options = options;
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
    /**
     * Guard the pre-rollback content of `paths` as a git commit, so a failed
     * rollback can be undone with a plain forward restore.
     */
    async captureGuard(provider, context, paths) {
        const unique = [...new Set(paths.map(item => provider.normalizeRelPath(item)))];
        const head = await provider.readRef(CHAIN_HEAD_REF);
        const entries = [];
        for (const rel of unique) {
            const blob = await provider.writeBlob(provider.absolutePath(rel)).catch(() => undefined);
            entries.push(blob === undefined ? { path: rel } : { path: rel, blob });
        }
        // Paths that do not exist must be *removed* from the guard tree even when
        // the head tree already lacked them (a no-op) or held a stale entry.
        const tree = await provider.withScratch(async (scratch) => {
            await provider.readTree(scratch, head);
            await provider.updateIndexInfo(scratch, entries);
            return provider.writeTree(scratch);
        });
        const guardId = `guard-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
        const present = entries.filter(entry => entry.blob !== undefined).map(entry => entry.path);
        const absent = entries.filter(entry => entry.blob === undefined).map(entry => entry.path);
        const message = [
            'guard',
            `session=${context.sessionId}`,
            `cwd=${context.cwd}`,
            ...present.map(item => `path=${item}`),
            ...absent.map(item => `absent=${item}`),
            '',
        ].join('\n');
        const commit = await provider.commitTree(tree, head === undefined ? [] : [head], message);
        if (!(await provider.updateRef(`${GUARDS_PREFIX}${guardId}`, commit))) {
            throw new Error(`rollback: failed to record guard ${guardId}`);
        }
        return { guardId, commit, cwd: context.cwd, sessionId: context.sessionId, present, absent };
    }
    /** Restore the guarded content of the selected paths (all of them by default). */
    async restoreGuard(provider, guard, paths) {
        const selected = paths === undefined
            ? [...guard.present, ...guard.absent]
            : [...new Set(paths.map(item => provider.normalizeRelPath(item)))];
        const present = selected.filter(rel => guard.present.includes(rel));
        const absent = selected.filter(rel => guard.absent.includes(rel));
        if (present.length > 0)
            await provider.restorePaths(guard.commit, present);
        for (const rel of absent) {
            await fs.promises.rm(provider.absolutePath(rel), { force: true });
        }
    }
    async loadGuard(provider, guardId) {
        const commit = await provider.readRef(`${GUARDS_PREFIX}${guardId}`);
        if (commit === undefined)
            return undefined;
        const message = await commitMessage(provider, commit);
        const present = [];
        const absent = [];
        let cwd = '';
        let sessionId = '';
        for (const line of message.split('\n')) {
            if (line.startsWith('path='))
                present.push(line.slice(5));
            else if (line.startsWith('absent='))
                absent.push(line.slice(7));
            else if (line.startsWith('cwd='))
                cwd = line.slice(4);
            else if (line.startsWith('session='))
                sessionId = line.slice(8);
        }
        return { guardId, commit, cwd, sessionId, present, absent };
    }
    /** Open a journal entry (`running`) for a rollback about to start. */
    async journalStart(provider, guard, paths) {
        const id = `journal-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
        await this.writeJournal(provider, id, {
            id,
            phase: 'running',
            guardId: guard.guardId,
            cwd: guard.cwd,
            sessionId: guard.sessionId,
            paths: [...new Set(paths)],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        return id;
    }
    async journalUpdate(provider, id, phase) {
        const ref = `${JOURNALS_PREFIX}${id}`;
        const current = await provider.readRef(ref);
        if (current === undefined)
            return;
        const record = await this.readJournal(provider, current);
        if (record === undefined)
            return;
        record.phase = phase;
        await this.writeJournal(provider, id, record);
    }
    async listJournals(provider) {
        const refs = await provider.listRefsDetailed(JOURNALS_PREFIX);
        const records = [];
        for (const entry of refs) {
            const record = parseJournal(entry.contents);
            if (record !== undefined)
                records.push({ ...record, id: entry.ref.slice(JOURNALS_PREFIX.length) });
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
            if (cwd === undefined || cwd === '')
                continue;
            let records;
            const provider = snapshots.providerFor(cwd, session.id);
            try {
                if (!(await provider.available()))
                    continue;
                records = await this.listJournals(provider);
            }
            catch {
                continue;
            }
            for (const record of records) {
                if (record.phase !== 'running' || record.guardId === undefined)
                    continue;
                const lock = await this.readLock(record.cwd ?? cwd);
                if (lock !== undefined && isAlive(lock.ownerPid) && Date.now() - lock.createdAt <= this.options.lockStaleMs)
                    continue;
                try {
                    const guard = await this.loadGuard(provider, record.guardId);
                    if (guard === undefined) {
                        await this.journalUpdate(provider, record.id, 'interrupted');
                        continue;
                    }
                    await this.restoreGuard(provider, guard, record.paths);
                    await this.journalUpdate(provider, record.id, 'rolled-back');
                }
                catch (error) {
                    ctx.logger.warn(`rollback reconciliation failed for journal ${record.id}:`, error);
                    await this.journalUpdate(provider, record.id, 'interrupted');
                }
            }
        }
    }
    async writeJournal(provider, id, record) {
        const ref = `${JOURNALS_PREFIX}${id}`;
        const previous = await provider.readRef(ref);
        const tree = previous !== undefined
            ? await provider.treeOf(previous)
            : await this.emptyTree(provider);
        record.updatedAt = Date.now();
        const message = [
            `state=${record.phase}`,
            `created=${record.createdAt}`,
            `updated=${record.updatedAt}`,
            ...(record.guardId === undefined ? [] : [`guard=${record.guardId}`]),
            ...(record.cwd === undefined ? [] : [`cwd=${record.cwd}`]),
            ...(record.sessionId === undefined ? [] : [`session=${record.sessionId}`]),
            ...record.paths.map(item => `path=${item}`),
            '',
        ].join('\n');
        const commit = await provider.commitTree(tree, previous === undefined ? [] : [previous], message);
        await provider.updateRef(ref, commit, previous);
    }
    /** The empty tree, used for the first commit of a journal chain. */
    async emptyTree(provider) {
        return provider.withScratch(async (scratch) => {
            await provider.readTree(scratch, undefined);
            return provider.writeTree(scratch);
        });
    }
    async readJournal(provider, commit) {
        const message = await commitMessage(provider, commit);
        return parseJournal(message);
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
function parseJournal(message) {
    let phase;
    let guardId;
    let cwd;
    let sessionId;
    let createdAt = 0;
    let updatedAt = 0;
    const paths = [];
    for (const line of message.split('\n')) {
        if (line.startsWith('state=')) {
            const value = line.slice(6);
            if (value === 'running' || value === 'completed' || value === 'rolled-back' || value === 'interrupted')
                phase = value;
        }
        else if (line.startsWith('guard='))
            guardId = line.slice(6);
        else if (line.startsWith('cwd='))
            cwd = line.slice(4);
        else if (line.startsWith('session='))
            sessionId = line.slice(8);
        else if (line.startsWith('created='))
            createdAt = Number(line.slice(8)) || 0;
        else if (line.startsWith('updated='))
            updatedAt = Number(line.slice(8)) || 0;
        else if (line.startsWith('path='))
            paths.push(line.slice(5));
    }
    if (phase === undefined)
        return undefined;
    return {
        id: '',
        phase,
        paths,
        createdAt,
        updatedAt,
        ...(guardId === undefined ? {} : { guardId }),
        ...(cwd === undefined ? {} : { cwd }),
        ...(sessionId === undefined ? {} : { sessionId }),
    };
}
async function commitMessage(provider, commit) {
    const result = await provider.run(['log', '-1', '--format=%B', commit]);
    return result.code === 0 ? result.stdout : '';
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
