import type { RollbackFileChange } from '../../shared/types.ts';
import type { ChangeLedger } from '../ledger.ts';
import type { RollbackCordisContext } from '../context.ts';
/**
 * Ledger fallback provider: ignored tool writes and non-git workspaces.
 * Git diff entries win for a path; ledger entries fill the paths git cannot see.
 */
export declare class LedgerProvider {
    private readonly ctx;
    private readonly ledger;
    constructor(ctx: RollbackCordisContext, ledger: ChangeLedger);
    mergeChanges(sessionId: string, turn: number, cwd: string, gitChanges: readonly RollbackFileChange[], gitAvailable: boolean): Promise<{
        changes: RollbackFileChange[];
        warnings: string[];
    }>;
}
