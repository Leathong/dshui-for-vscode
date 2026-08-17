import * as fs from 'node:fs';
import * as path from 'node:path';
import { changeLedgerRoot, writeJsonFileAtomic } from "./snapshot.js";
/** Default cap on stored accept-time content; matches the ledger text bound. */
export const DEFAULT_ACCEPT_CONTENT_MAX_BYTES = 256 * 1024;
export function acceptsPath() {
    return path.join(changeLedgerRoot(), 'v1', 'accepts.json');
}
function trimRecords(records, maxPerSession) {
    const bySession = new Map();
    for (const record of records) {
        const list = bySession.get(record.sessionId) ?? [];
        list.push(record);
        bySession.set(record.sessionId, list);
    }
    const result = [];
    for (const list of bySession.values())
        result.push(...list.slice(-maxPerSession));
    return result;
}
function fingerprintMatches(record, fingerprint) {
    if (record.fingerprint === undefined)
        return true;
    if (fingerprint === undefined)
        return false;
    if (record.fingerprint.kind === 'content' && fingerprint.kind === 'content') {
        return record.fingerprint.hash === fingerprint.hash;
    }
    if (record.fingerprint.kind === 'stat' && fingerprint.kind === 'stat') {
        const left = record.fingerprint;
        const right = fingerprint;
        if (left.version !== undefined || right.version !== undefined) {
            if (left.version !== right.version)
                return false;
        }
        if (left.size !== right.size)
            return false;
        if (left.mtimeMs !== right.mtimeMs)
            return false;
        return true;
    }
    return false;
}
/** Exact identity of two accept fingerprints (undefined equals undefined). */
function fingerprintsEqual(left, right) {
    if (left === undefined || right === undefined)
        return left === right;
    if (left.kind !== right.kind)
        return false;
    if (left.kind === 'content' && right.kind === 'content')
        return left.hash === right.hash;
    if (left.kind === 'stat' && right.kind === 'stat') {
        if (left.version !== right.version)
            return false;
        if (left.size !== right.size)
            return false;
        if (left.mtimeMs !== right.mtimeMs)
            return false;
        return true;
    }
    return false;
}
export class AcceptLedger {
    options;
    records = [];
    loaded = false;
    writeTail = Promise.resolve();
    maxPerSession;
    maxContentBytes;
    file;
    constructor(options = {}) {
        this.options = options;
        this.maxPerSession = options.maxAcceptRecordsPerSession ?? 500;
        this.maxContentBytes = options.maxContentBytes ?? DEFAULT_ACCEPT_CONTENT_MAX_BYTES;
        this.file = options.acceptsFile ?? acceptsPath();
    }
    load() {
        if (this.loaded)
            return;
        this.loaded = true;
        this.records.push(...readJsonFileSync(this.file, []));
    }
    upsert(record) {
        this.load();
        const index = this.records.findIndex(item => item.sessionId === record.sessionId && item.kind === record.kind && item.key === record.key);
        if (index >= 0)
            this.records[index] = record;
        else
            this.records.push(record);
        this.persist();
    }
    persist() {
        const trimmed = trimRecords(this.records, this.maxPerSession);
        this.records.length = 0;
        this.records.push(...trimmed);
        this.writeTail = this.writeTail
            .catch(() => undefined)
            .then(async () => writeJsonFileAtomic(this.file, this.records))
            .catch(() => undefined);
    }
    acceptFile(sessionId, filePath, fingerprint, content) {
        this.load();
        const stored = content !== undefined && Buffer.byteLength(content, 'utf8') <= this.maxContentBytes ? content : undefined;
        const existing = this.records.find(item => item.sessionId === sessionId && item.kind === 'file' && item.key === filePath);
        // Re-accepting an unchanged state is a no-op: only the latest snapshot
        // matters, and an identical one would just rewrite the same record.
        if (existing !== undefined && existing.content === stored && fingerprintsEqual(existing.fingerprint, fingerprint))
            return;
        this.upsert({
            sessionId,
            kind: 'file',
            key: filePath,
            ...(fingerprint === undefined ? {} : { fingerprint }),
            ...(stored === undefined ? {} : { content: stored }),
            createdAt: Date.now(),
        });
    }
    acceptModification(sessionId, modificationId) {
        this.load();
        if (this.records.some(item => item.sessionId === sessionId && item.kind === 'modification' && item.key === modificationId))
            return;
        this.upsert({ sessionId, kind: 'modification', key: modificationId, createdAt: Date.now() });
    }
    fileAccepted(sessionId, filePath, fingerprint) {
        this.load();
        const record = this.records.find(item => item.sessionId === sessionId && item.kind === 'file' && item.key === filePath);
        if (record === undefined)
            return false;
        return fingerprintMatches(record, fingerprint);
    }
    /** Bounded text content captured at accept time (diff baseline for later changes). */
    acceptedContent(sessionId, filePath) {
        this.load();
        return this.records.find(item => item.sessionId === sessionId && item.kind === 'file' && item.key === filePath)?.content;
    }
    modificationAccepted(sessionId, modificationId) {
        this.load();
        return this.records.some(item => item.sessionId === sessionId && item.kind === 'modification' && item.key === modificationId);
    }
    acceptedFiles(sessionId) {
        this.load();
        return this.records
            .filter(item => item.sessionId === sessionId && item.kind === 'file')
            .map(item => item.key);
    }
    acceptedModifications(sessionId) {
        this.load();
        return this.records
            .filter(item => item.sessionId === sessionId && item.kind === 'modification')
            .map(item => item.key);
    }
    list(sessionId) {
        this.load();
        return sessionId === undefined
            ? [...this.records]
            : this.records.filter(item => item.sessionId === sessionId);
    }
    /** Await pending persistence (tests and graceful shutdown paths). */
    async flush() {
        this.load();
        await this.writeTail.catch(() => undefined);
    }
}
function readJsonFileSync(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch {
        return fallback;
    }
}
