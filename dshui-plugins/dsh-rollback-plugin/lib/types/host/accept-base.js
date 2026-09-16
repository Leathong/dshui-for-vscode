/**
 * The accept baseline of one session, held entirely in git
 * (docs/git-only-plan.md §2.4, §2.5).
 *
 * `refs/dsh/accepted` is a commit chain whose tip tree is the accepted
 * content. Accepting never touches the worktree, so it needs no workspace lock,
 * no fence and no session flush. "Is this file accepted?" is a blob-hash
 * comparison, which removes the fingerprint / accept-time-content bookkeeping
 * the ledger used to keep.
 */
export const ACCEPTED_REF = 'refs/dsh/accepted';
export class AcceptBase {
    ctx;
    snapshots;
    options;
    constructor(ctx, snapshots, options = { spawnTimeoutMs: 60_000 }) {
        this.ctx = ctx;
        this.snapshots = snapshots;
        this.options = options;
    }
    /**
     * Ensure the accepted baseline exists for a session, seeding it from the
     * turn-start tree when this is the first call. Returns the commit that the
     * ref points at (used directly as a tree-ish for diffs).
     */
    async ensure(cwd, sessionId, seedTree, options = {}) {
        const provider = this.snapshots.providerFor(cwd, sessionId);
        if (!(await provider.available().catch(() => false)))
            return undefined;
        const existing = await provider.readRef(ACCEPTED_REF);
        if (existing !== undefined)
            return existing;
        // Creating the baseline from a bare worktree capture would bake every other
        // session's current content into `accepted` as if this session had accepted
        // it. Only the list path may do that (it then diffs against its own chain
        // base); accept paths must never invent a baseline.
        const tree = seedTree ?? (options.requireSeed === true ? undefined : await provider.captureTree().catch(() => undefined));
        if (tree === undefined)
            return undefined;
        const commit = await provider.commitTree(tree, [], `dsh accepted baseline\nsession=${sessionId}\n`);
        await provider.updateRef(ACCEPTED_REF, commit);
        return commit;
    }
    /** The current accepted commit, when the baseline already exists. */
    async ref(cwd, sessionId) {
        const provider = this.snapshots.providerFor(cwd, sessionId);
        if (!(await provider.available().catch(() => false)))
            return undefined;
        return provider.readRef(ACCEPTED_REF);
    }
    /** The accepted blob of one path (undefined = absent from the accepted tree). */
    async acceptedBlob(cwd, sessionId, relPath) {
        const commit = await this.ref(cwd, sessionId);
        if (commit === undefined)
            return undefined;
        const provider = this.snapshots.providerFor(cwd, sessionId);
        return provider.blobHash(commit, relPath).catch(() => undefined);
    }
    /**
     * Accept the current worktree content of each path (a file that disappeared
     * is accepted as a deletion). This is the only accept path that reads the
     * worktree.
     */
    async acceptPaths(cwd, sessionId, relPaths, options = {}) {
        const provider = this.snapshots.providerFor(cwd, sessionId);
        const baseline = await this.ensure(cwd, sessionId, options.seedTree, { requireSeed: true });
        if (baseline === undefined)
            return { ok: false, reason: 'no-accepted-baseline' };
        const paths = [...new Set(relPaths.map(item => provider.normalizeRelPath(item)))];
        if (paths.length === 0)
            return { ok: true, commit: baseline };
        const tree = await provider.withScratch(async (scratch) => {
            await provider.readTree(scratch, baseline);
            const entries = [];
            for (const rel of paths) {
                const abs = provider.absolutePath(rel);
                const blob = await provider.writeBlob(abs).catch(() => undefined);
                entries.push(blob === undefined ? { path: rel } : { path: rel, blob });
            }
            await provider.updateIndexInfo(scratch, entries);
            return provider.writeTree(scratch);
        });
        // Compare-and-swap so two concurrent accepts cannot silently drop one.
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const current = await provider.readRef(ACCEPTED_REF);
            if (current === undefined)
                return { ok: false, reason: 'git-unavailable' };
            const commit = await provider.commitTree(tree, [current], `${options.message ?? 'accept'}\npaths=${paths.join(',')}\n`);
            if (await provider.updateRef(ACCEPTED_REF, commit, current))
                return { ok: true, commit };
        }
        return { ok: false, reason: 'accept-conflict' };
    }
    /**
     * Accept one patch by applying its forward diff onto the accepted tree. The
     * fast path (accepted already sits exactly before the patch) only registers
     * the patch blob; otherwise git applies the patch forward and may fall back
     * to a three-way merge, since every pre-image is in the object store.
     */
    async acceptPatch(cwd, sessionId, relPath, patch, options = {}) {
        const provider = this.snapshots.providerFor(cwd, sessionId);
        const baseline = await this.ensure(cwd, sessionId, options.seedTree, { requireSeed: true });
        if (baseline === undefined)
            return { ok: false, reason: 'no-accepted-baseline' };
        const rel = provider.normalizeRelPath(relPath);
        const accepted = await provider.blobHash(baseline, rel).catch(() => undefined);
        const fast = accepted !== undefined && options.beforeBlob !== undefined && accepted === options.beforeBlob && options.afterBlob !== undefined;
        const applied = await provider.withScratch(async (scratch) => {
            await provider.readTree(scratch, baseline);
            if (fast) {
                // The accepted content is exactly this patch's pre-image: register the
                // post-image directly and skip the patch machinery entirely.
                await provider.updateIndexInfo(scratch, [{ path: rel, blob: options.afterBlob }]);
            }
            else if (patch.trim() !== '') {
                let result = await provider.applyCached(scratch, patch);
                if (!result.ok)
                    result = await provider.applyCached(scratch, patch, { threeWay: true });
                if (!result.ok)
                    return { ok: false, reason: result.stderr || 'patch-conflict' };
            }
            return { ok: true, tree: await provider.writeTree(scratch) };
        });
        if (!applied.ok || applied.tree === undefined)
            return { ok: false, reason: applied.reason };
        const tree = applied.tree;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const current = await provider.readRef(ACCEPTED_REF);
            if (current === undefined)
                return { ok: false, reason: 'git-unavailable' };
            const commit = await provider.commitTree(tree, [current], `accept patch\npaths=${rel}\n`);
            if (await provider.updateRef(ACCEPTED_REF, commit, current))
                return { ok: true, commit };
        }
        return { ok: false, reason: 'accept-conflict' };
    }
}
