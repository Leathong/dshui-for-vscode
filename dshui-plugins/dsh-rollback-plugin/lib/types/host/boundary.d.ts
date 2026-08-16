import type { RollbackBoundaryInfo, RollbackFailure } from '../shared/types.ts';
import type { Session, SessionEvent } from './context.ts';
export interface ResolvedBoundary {
    targetTurn: number;
    forkAtSeq?: number;
    forkAvailable: boolean;
    assistantEvent: SessionEvent & {
        type: 'assistant/message';
    };
    turnStartSeq?: number;
}
export declare function resolveBoundary(session: Session, messageId: string): {
    boundary?: ResolvedBoundary;
    failure?: RollbackFailure;
};
export declare function findPreviousTurnEnd(events: readonly SessionEvent[], beforeSeq: number): (SessionEvent & {
    type: 'turn/end';
}) | undefined;
export declare function boundaryInfo(boundary: ResolvedBoundary): RollbackBoundaryInfo;
