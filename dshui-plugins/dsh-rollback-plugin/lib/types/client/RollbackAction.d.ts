import type { ReactElement } from 'react';
import type { OpenAtResult, RollbackExecuteRequest, RollbackExecuteResult, RollbackPrepareResult } from '../shared/types.ts';
import type { RollbackLocaleKey } from './locales.ts';
export interface RollbackActionInjected {
    prepare: (messageId: string) => Promise<{
        ok: true;
        value: RollbackPrepareResult;
    } | {
        ok: false;
        error: {
            message: string;
        };
    }>;
    execute: (messageId: string, request: Omit<RollbackExecuteRequest, 'sessionId' | 'messageId'>) => Promise<{
        ok: true;
        value: RollbackExecuteResult;
    } | {
        ok: false;
        error: {
            message: string;
        };
    }>;
    openAt: (path: string, line?: number) => Promise<{
        ok: true;
        value: OpenAtResult;
    } | {
        ok: false;
        error: {
            message: string;
        };
    }>;
    forkAt: (seq: number) => Promise<string>;
}
export interface RollbackActionProps {
    messageId: string;
    prepare: RollbackActionInjected['prepare'];
    execute: RollbackActionInjected['execute'];
    openAt: RollbackActionInjected['openAt'];
    forkAt: RollbackActionInjected['forkAt'];
    t: (key: RollbackLocaleKey) => string;
}
export declare function RollbackAction(props: RollbackActionProps): ReactElement;
