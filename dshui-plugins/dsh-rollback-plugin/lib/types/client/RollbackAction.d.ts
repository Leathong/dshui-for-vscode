import type { ReactElement } from 'react';
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { OpenAtResult, RollbackExecuteRequest, RollbackExecuteResult, RollbackPrepareResult } from '../shared/types.ts';
import type { RollbackLocaleKey } from './locales.ts';
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
    prepare: (target: RollbackTarget) => Promise<RemoteLike<RollbackPrepareResult>>;
    execute: (target: RollbackTarget, request: Omit<RollbackExecuteRequest, 'sessionId' | 'messageId' | 'turn'>) => Promise<RemoteLike<RollbackExecuteResult>>;
    openAt: (path: string, line?: number) => Promise<RemoteLike<OpenAtResult>>;
    forkAt: (seq: number) => Promise<string>;
}
export interface RollbackActionProps {
    target: RollbackTarget;
    prepare: RollbackActionInjected['prepare'];
    execute: RollbackActionInjected['execute'];
    openAt: RollbackActionInjected['openAt'];
    forkAt: RollbackActionInjected['forkAt'];
    t: (key: RollbackLocaleKey) => string;
}
export declare function RollbackAction(props: RollbackActionProps): ReactElement;
/** Assistant-message entry: the owner supplies the closing messageId. */
export declare function MessageRollbackAction(props: {
    messageId: string;
    prepare: RollbackActionInjected['prepare'];
    execute: RollbackActionInjected['execute'];
    openAt: RollbackActionInjected['openAt'];
    forkAt: RollbackActionInjected['forkAt'];
    t: (key: RollbackLocaleKey) => string;
}): ReactElement;
/**
 * Turn-tail entry for turns without a text closing assistant (stopped /
 * interrupted / error turns): the ordinary action row never renders, so the
 * rollback button appears here. The chain selector decides the match; this
 * wrapper just anchors the core action to the turn.
 */
export declare function TurnRollbackAction(props: {
    turn: TurnTailOwnerProps['turn'];
    matched: {
        turn: number;
    };
    prepare: RollbackActionInjected['prepare'];
    execute: RollbackActionInjected['execute'];
    openAt: RollbackActionInjected['openAt'];
    forkAt: RollbackActionInjected['forkAt'];
    t: (key: RollbackLocaleKey) => string;
}): ReactElement;
export {};
