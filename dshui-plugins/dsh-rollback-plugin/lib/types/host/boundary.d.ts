import type { RollbackBoundaryInfo, RollbackFailure } from '../shared/types.ts';
import type { Session, SessionEvent } from './context.ts';
export interface ResolvedBoundary {
    targetTurn: number;
    forkAtSeq?: number;
    forkAvailable: boolean;
    assistantEvent?: SessionEvent & {
        type: 'assistant/message';
    };
    turnStartSeq?: number;
}
export declare function resolveBoundary(session: Session, messageId: string): {
    boundary?: ResolvedBoundary;
    failure?: RollbackFailure;
};
/**
 * Resolve the rollback boundary of a turn by its number. Works for unfinished
 * turns (a stopped/interrupted assistant message never emits `turn/end`): the
 * rollback target is the turn-start snapshot and the fork anchor is the last
 * completed turn end before it.
 */
export declare function resolveBoundaryForTurn(session: Session, turn: number): {
    boundary?: ResolvedBoundary;
    failure?: RollbackFailure;
};
export declare function findPreviousTurnEnd(events: readonly SessionEvent[], beforeSeq: number): (SessionEvent & {
    type: 'turn/end';
}) | undefined;
export declare function boundaryInfo(boundary: ResolvedBoundary): RollbackBoundaryInfo;
