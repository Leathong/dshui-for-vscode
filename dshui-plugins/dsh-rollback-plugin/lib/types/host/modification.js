import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { normalizeLf } from "./ledger.js";
import { spawnGit } from "./providers/git.js";
/**
 * Undo one write/edit tool modification with a three-way reverse merge:
 * base = after (A), ours = current (B), theirs = before (O).
 */
export async function restoreModification(ctx, ledger, cwd, record, deleteCreatedPolicy, timeoutMs, sandboxPolicy) {
    const before = record.beforeContent;
    if (record.beforeExisted && before === undefined) {
        return { status: 'unsupported', detail: 'no bounded text before-image for this modification' };
    }
    let target;
    let current;
    let currentInfo;
    try {
        target = await ctx.fs.resolve(record.path, { cwd });
        currentInfo = await ctx.fs.stat(target);
        if (currentInfo !== undefined)
            current = await ctx.fs.readText(target);
    }
    catch {
        if (currentInfo !== undefined && currentInfo.type === 'file' && (currentInfo.size ?? 0) > ledger.ledgerMaxTextBytes) {
            return { status: 'unsupported', detail: 'current file is too large for modification-level merge' };
        }
        return { status: 'failed', detail: 'current file could not be read' };
    }
    const rebuilt = rebuildAfter(record);
    if (!rebuilt.ok)
        return { status: 'unsupported', detail: rebuilt.detail };
    const after = normalizeLf(rebuilt.value.after);
    const currentLf = current === undefined ? undefined : normalizeLf(current);
    if (!record.beforeExisted || rebuilt.value.created) {
        if (current === undefined) {
            return { status: 'restored', detail: 'created file is already absent' };
        }
        if (currentLf !== after) {
            return {
                status: 'conflict',
                detail: 'the created file was modified after the write; use whole-file restore or delete explicitly',
            };
        }
        if (!deleteCreatedPolicy) {
            return { status: 'conflict', detail: 'undoing file creation requires createdPolicy=delete' };
        }
        try {
            fs.rmSync(ctx.fs.processPath(target), { force: true });
            return { status: 'restored', deleted: true, detail: 'created file deleted' };
        }
        catch (error) {
            return { status: 'failed', detail: `failed to delete created file: ${String(error)}` };
        }
    }
    if (current === undefined) {
        return {
            status: 'conflict',
            detail: 'the file no longer exists; its creation was not produced by this modification',
        };
    }
    const beforeLf = normalizeLf(before ?? '');
    const normalizedCurrent = normalizeLf(current);
    if (normalizedCurrent === beforeLf)
        return { status: 'restored', detail: 'file already matches the pre-modification state' };
    const merged = await mergeFiles(normalizedCurrent, after, beforeLf, timeoutMs);
    if (!merged.ok) {
        return { status: 'conflict', detail: merged.detail ?? 'three-way merge conflict' };
    }
    try {
        const style = current.includes('\r\n') ? '\r\n' : '\n';
        const output = merged.value.split('\n').join(style);
        await ctx.fs.writeText(target, output, currentInfo === undefined ? { kind: 'createIfAbsent' } : { kind: 'replaceIfVersion', version: currentInfo.version }, undefined, sandboxPolicy);
        const verify = normalizeLf(await ctx.fs.readText(target));
        if (verify !== merged.value) {
            return { status: 'failed', detail: 'post-write verification failed' };
        }
        return { status: 'restored' };
    }
    catch (error) {
        return { status: 'failed', detail: String(error) };
    }
}
export async function mergeFiles(current, base, other, timeoutMs) {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-rollback-merge-'));
    const currentFile = path.join(dir, 'B');
    const baseFile = path.join(dir, 'A');
    const otherFile = path.join(dir, 'O');
    try {
        await Promise.all([
            fs.promises.writeFile(currentFile, current, 'utf8'),
            fs.promises.writeFile(baseFile, base, 'utf8'),
            fs.promises.writeFile(otherFile, other, 'utf8'),
        ]);
        const result = await spawnGit(dir, ['merge-file', '-p', 'B', 'A', 'O'], process.env, timeoutMs);
        if (result.code !== 0)
            return { ok: false, detail: result.stderr.trim() || 'git merge-file reported a conflict' };
        return { ok: true, value: normalizeLf(result.stdout) };
    }
    finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
function rebuildAfter(record) {
    if (record.argsRaw === undefined) {
        return { ok: false, detail: 'tool arguments were not captured for this modification' };
    }
    let args;
    try {
        args = JSON.parse(record.argsRaw);
    }
    catch {
        return { ok: false, detail: 'tool arguments are not valid JSON' };
    }
    if (typeof args !== 'object' || args === null)
        return { ok: false, detail: 'tool arguments are malformed' };
    const value = args;
    if (record.toolName === 'write') {
        const content = value.content;
        if (typeof content !== 'string')
            return { ok: false, detail: 'write content argument is unavailable' };
        return { ok: true, value: { after: content, created: !record.beforeExisted } };
    }
    const oldString = firstString(value, 'old_string', 'oldString');
    const newString = firstString(value, 'new_string', 'newString');
    const replaceAll = firstBoolean(value, 'replace_all', 'replaceAll') ?? false;
    if (oldString === undefined || newString === undefined) {
        return { ok: false, detail: 'edit old_string/new_string/replace_all arguments are unavailable' };
    }
    const before = record.beforeContent ?? '';
    const matches = countMatches(before, oldString);
    if (matches === 0 || (!replaceAll && matches !== 1)) {
        return { ok: false, detail: `edit arguments do not match the captured before-image (${matches} matches)` };
    }
    return { ok: true, value: { after: before.split(oldString).join(newString), created: false } };
}
function firstString(value, snake, camel) {
    const candidate = value[snake] ?? value[camel];
    return typeof candidate === 'string' ? candidate : undefined;
}
function firstBoolean(value, snake, camel) {
    const candidate = value[snake] ?? value[camel];
    return typeof candidate === 'boolean' ? candidate : undefined;
}
function countMatches(text, needle) {
    if (needle === '')
        return 0;
    let count = 0;
    let index = text.indexOf(needle);
    while (index !== -1) {
        count += 1;
        index = text.indexOf(needle, index + needle.length);
    }
    return count;
}
