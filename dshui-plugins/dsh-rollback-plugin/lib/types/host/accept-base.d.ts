import type { RollbackCordisContext } from './context.ts';
import type { SnapshotManager } from './snapshot.ts';
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
export declare const ACCEPTED_REF = "refs/dsh/accepted";
export declare class AcceptBase {
    private readonly ctx;
    private readonly snapshots;
    private readonly options;
    constructor(ctx: RollbackCordisContext, snapshots: SnapshotManager, options?: {
        spawnTimeoutMs: number;
    });
    /**
     * Ensure the accepted baseline exists for a session, seeding it from the
     * turn-start tree when this is the first call. Returns the commit that the
     * ref points at (used directly as a tree-ish for diffs).
     */
    ensure(cwd: string, sessionId: string, seedTree?: string, options?: {
        requireSeed?: boolean;
    }): Promise<string | undefined>;
    /** The current accepted commit, when the baseline already exists. */
    ref(cwd: string, sessionId: string): Promise<string | undefined>;
    /**
     * Ensure the accepted baseline and fold in the session-start blobs of paths
     * the chain base tree never captured (ignored files, paths excluded from
     * `add -A` for commitless nested repositories).
     *
     * These entries describe the state *before* the session wrote the file, so
     * they belong to the baseline exactly like the chain-base tree. Entries are
     * only added when the accepted tree does not know the path yet, which keeps a
     * user accept authoritative. Every write is a compare-and-swap and the
     * common, fully merged case is one `cat-file --batch-check`.
     */
    ensureBaseline(cwd: string, sessionId: string, seedTree: string | undefined, preImages: ReadonlyMap<string, string>): Promise<{
        commit?: string;
        merged: string[];
        skipped: string[];
    }>;
    /** The accepted blob of one path (undefined = absent from the accepted tree). */
    acceptedBlob(cwd: string, sessionId: string, relPath: string): Promise<string | undefined>;
    /**
     * Accept the current worktree content of each path (a file that disappeared
     * is accepted as a deletion). This is the only accept path that reads the
     * worktree. The returned `blobs` map holds the accepted (post-image) blob of
     * every requested path — `undefined` for a deletion — so callers can classify
     * modifications without resolving the accepted tree again.
     */
    acceptPaths(cwd: string, sessionId: string, relPaths: readonly string[], options?: {
        seedTree?: string;
        message?: string;
    }): Promise<{
        ok: boolean;
        reason?: string;
        commit?: string;
        blobs?: Map<string, string | undefined>;
    }>;
    /**
     * Accept one patch by applying its forward diff onto the accepted tree. The
     * fast path (accepted already sits exactly before the patch) only registers
     * the patch blob; otherwise git applies the patch forward and may fall back
     * to a three-way merge, since every pre-image is in the object store.
     */
    acceptPatch(cwd: string, sessionId: string, relPath: string, patch: string, options?: {
        beforeBlob?: string;
        afterBlob?: string;
        seedTree?: string;
    }): Promise<{
        ok: boolean;
        reason?: string;
        commit?: string;
        blobs?: Map<string, string | undefined>;
    }>;
}
