import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { diffGitPath, parseDiffHunks, splitDiffSections } from "./providers/git.js";
/** Split a multi-file patch into per-file sections with complete hunks. */
export function splitPatchFiles(patch) {
    const files = [];
    for (const section of splitDiffSections(patch)) {
        const parsed = splitPatchFile(section);
        if (parsed !== undefined)
            files.push(parsed);
    }
    return files;
}
function splitPatchFile(section) {
    const lines = section.split('\n');
    while (lines.length > 0 && lines[lines.length - 1] === '')
        lines.pop();
    if (lines.length === 0)
        return undefined;
    const path = diffGitPath(lines[0] ?? '');
    if (path === undefined)
        return undefined;
    const firstHunk = lines.findIndex(line => line.startsWith('@@ '));
    const head = firstHunk < 0 ? lines : lines.slice(0, firstHunk);
    const header = `${head.join('\n')}\n`;
    const hunks = [];
    if (firstHunk >= 0) {
        let current = [];
        for (const line of lines.slice(firstHunk)) {
            if (line.startsWith('@@ ')) {
                if (current.length > 0)
                    hunks.push(`${current.join('\n')}\n`);
                current = [line];
            }
            else {
                current.push(line);
            }
        }
        if (current.length > 0)
            hunks.push(`${current.join('\n')}\n`);
    }
    const binary = /Binary files .* differ|GIT binary patch/.test(section);
    const status = header.includes('new file mode') ? 'added'
        : header.includes('deleted file mode') ? 'deleted'
            : binary ? 'binary'
                : 'modified';
    const index = /^index ([0-9a-f]+)\.\.([0-9a-f]+)/m.exec(header);
    return {
        path,
        status,
        header,
        hunks,
        ...(index?.[1] === undefined || /^0+$/.test(index[1]) ? {} : { oldBlob: index[1] }),
        ...(index?.[2] === undefined || /^0+$/.test(index[2]) ? {} : { newBlob: index[2] }),
    };
}
/** Stable identity of one hunk block, used to bind a selection across refreshes. */
export function hunkFingerprint(hunk) {
    return createHash('sha256').update(hunk).digest('hex').slice(0, 32);
}
/** Per-file views with display hunks, fingerprints and truncation limits. */
export function patchFileViews(patch, maxHunks, maxBytes) {
    return splitPatchFiles(patch).map(file => {
        const parsed = parseDiffHunks(file.header + file.hunks.join(''), maxHunks, maxBytes);
        const fingerprints = file.hunks.slice(0, parsed.hunks.length).map(hunkFingerprint);
        return {
            ...file,
            view: parsed.hunks,
            fingerprints,
            truncated: parsed.truncated || file.hunks.length > parsed.hunks.length,
            binary: parsed.binary || file.status === 'binary',
        };
    });
}
/**
 * Undo the selected hunks of one file. The worktree is only written after the
 * forward complement applied cleanly to the index.
 */
export async function applyHunkUndo(provider, scratchIndex, options) {
    const rel = provider.normalizeRelPath(options.path);
    await provider.readTree(scratchIndex, options.acceptedCommit);
    const patch = await provider.diffPatch(options.acceptedCommit, undefined, [rel], {
        context: options.context,
        indexFile: scratchIndex,
    });
    const file = splitPatchFiles(patch).find(item => item.path === rel);
    if (file === undefined || file.hunks.length === 0)
        return { ok: true, undone: 0 };
    if (file.status === 'binary')
        return { ok: false, undone: 0, reason: 'binary' };
    const undo = new Set(options.undo.filter(index => index >= 0 && index < file.hunks.length));
    if (undo.size === 0)
        return { ok: true, undone: 0 };
    const keep = file.hunks.filter((_, index) => !undo.has(index));
    if (keep.length === 0) {
        if (file.status === 'added') {
            // Undoing every hunk of a file the baseline never had deletes it.
            await fs.promises.rm(provider.absolutePath(rel), { force: true });
            return { ok: true, undone: undo.size };
        }
        // The index was reset to the accepted tree: materializing it is the undo.
        await provider.checkoutIndex(scratchIndex, [rel]);
        return { ok: true, undone: undo.size };
    }
    const unidiffZero = options.context === 0;
    const combined = file.header + keep.join('');
    let applied = await provider.applyCached(scratchIndex, combined, { unidiffZero });
    if (!applied.ok)
        applied = await provider.applyCached(scratchIndex, combined, { unidiffZero, threeWay: true });
    if (!applied.ok)
        return { ok: false, undone: 0, reason: applied.stderr || 'hunk-conflict' };
    await provider.checkoutIndex(scratchIndex, [rel]);
    return { ok: true, undone: undo.size };
}
/**
 * Rebuild a file as "accepted + every call except the skipped one", applying
 * each call's patch forward in order. A step that no longer applies on its own
 * falls back to a three-way merge (all pre-images are in the object store).
 */
export async function replayPatches(provider, scratchIndex, base, steps, skip) {
    await provider.readTree(scratchIndex, base);
    const paths = new Set();
    for (let index = 0; index < steps.length; index += 1) {
        if (skip.has(index))
            continue;
        const step = steps[index];
        if (step.patch.trim() === '')
            continue;
        let applied = await provider.applyCached(scratchIndex, step.patch);
        if (!applied.ok)
            applied = await provider.applyCached(scratchIndex, step.patch, { threeWay: true });
        if (!applied.ok)
            return { ok: false, reason: applied.stderr || 'patch-conflict', failedStep: index };
        paths.add(provider.normalizeRelPath(step.path));
    }
    if (paths.size > 0)
        await provider.checkoutIndex(scratchIndex, [...paths]);
    return { ok: true };
}
