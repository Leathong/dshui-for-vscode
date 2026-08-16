import type { LedgerModificationRecord, ChangeLedger } from './ledger.ts';
import type { RollbackCordisContext } from './context.ts';
export type ModificationRestoreStatus = 'restored' | 'conflict' | 'unsupported' | 'failed';
export interface ModificationRestoreOutcome {
    status: ModificationRestoreStatus;
    detail?: string;
    deleted?: boolean;
}
/**
 * Undo one write/edit tool modification with a three-way reverse merge:
 * base = after (A), ours = current (B), theirs = before (O).
 */
export declare function restoreModification(ctx: RollbackCordisContext, ledger: ChangeLedger, cwd: string, record: LedgerModificationRecord, deleteCreatedPolicy: boolean, timeoutMs: number): Promise<ModificationRestoreOutcome>;
export declare function mergeFiles(current: string, base: string, other: string, timeoutMs: number): Promise<{
    ok: true;
    value: string;
} | {
    ok: false;
    detail?: string;
}>;
