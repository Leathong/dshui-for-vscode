/**
 * Ledger fallback provider: ignored tool writes and non-git workspaces.
 * Git diff entries win for a path; ledger entries fill the paths git cannot see.
 */
export class LedgerProvider {
    ctx;
    ledger;
    constructor(ctx, ledger) {
        this.ctx = ctx;
        this.ledger = ledger;
    }
    async mergeChanges(sessionId, turn, cwd, gitChanges, gitAvailable) {
        const warnings = [];
        const ledgerChanges = await this.ledger.buildFileChanges(sessionId, turn, cwd, gitAvailable ? 'ignored' : 'fallback');
        const byPath = new Map();
        for (const change of gitChanges)
            byPath.set(change.path, change);
        for (const change of ledgerChanges) {
            if (byPath.has(change.path))
                continue;
            byPath.set(change.path, change);
        }
        if (!gitAvailable) {
            warnings.push('workspace is not inside a git work tree; only tool write/edit modifications captured by the ledger can be restored');
        }
        return { changes: [...byPath.values()], warnings };
    }
}
