import type { ReactElement } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { OpenAtResult, RollbackExecuteRequest, RollbackExecuteResult, RollbackPrepareResult } from '../shared/types.ts';
/** Rollback anchor: a finalized assistant message or a turn number. */
export interface RollbackTarget {
    messageId?: string;
    turn?: number;
}
type RemoteLike<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        message: string;
    };
};
export interface RollbackActionInjected {
    sessionId: SessionId;
    prepare: (target: RollbackTarget) => Promise<RemoteLike<RollbackPrepareResult>>;
    execute: (target: RollbackTarget, request: Omit<RollbackExecuteRequest, 'sessionId' | 'messageId' | 'turn'>) => Promise<RemoteLike<RollbackExecuteResult>>;
    openAt: (path: string, line?: number) => Promise<RemoteLike<OpenAtResult>>;
    forkAt: (seq: number) => Promise<string>;
    restart: (cwd: string) => Promise<string>;
}
export interface RollbackActionProps {
    target: RollbackTarget;
    sessionId: RollbackActionInjected['sessionId'];
    prepare: RollbackActionInjected['prepare'];
    execute: RollbackActionInjected['execute'];
    openAt: RollbackActionInjected['openAt'];
    forkAt: RollbackActionInjected['forkAt'];
    restart: RollbackActionInjected['restart'];
    t: TranslateNS<'rollback'>;
}
export declare function RollbackAction(props: RollbackActionProps): ReactElement;
/** User-message entry: rollback anchored to the Turn the message opens. The
 * user-actions owner passes the enclosing TurnLocation; this wrapper anchors
 * the core action to that Turn (restore everything after the user message).
 */
export declare function UserRollbackAction(props: {
    turn: TurnLocation;
    sessionId: RollbackActionInjected['sessionId'];
    prepare: RollbackActionInjected['prepare'];
    execute: RollbackActionInjected['execute'];
    openAt: RollbackActionInjected['openAt'];
    forkAt: RollbackActionInjected['forkAt'];
    restart: RollbackActionInjected['restart'];
    t: TranslateNS<'rollback'>;
}): ReactElement;
export {};
