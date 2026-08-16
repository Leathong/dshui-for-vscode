import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { OpenAtResult, RollbackExecuteRequest, RollbackExecuteResult, RollbackPrepareResult, RollbackStatusResult } from './types.ts';
export interface RollbackRemote {
    prepare(sessionId: string, messageId: string): Promise<RemoteResult<RollbackPrepareResult>>;
    execute(request: RollbackExecuteRequest): Promise<RemoteResult<RollbackExecuteResult>>;
    openAt(sessionId: string, path: string, line?: number): Promise<RemoteResult<OpenAtResult>>;
    status(sessionId: string): Promise<RemoteResult<RollbackStatusResult>>;
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteMap {
        'rollback/prepare'(sessionId: string, messageId: string): Promise<RemoteResult<RollbackPrepareResult>>;
        'rollback/execute'(request: RollbackExecuteRequest): Promise<RemoteResult<RollbackExecuteResult>>;
        'rollback/openAt'(sessionId: string, path: string, line?: number): Promise<RemoteResult<OpenAtResult>>;
        'rollback/status'(sessionId: string): Promise<RemoteResult<RollbackStatusResult>>;
    }
    interface TypertRemoteNamespaceMap {
        rollback: RollbackRemote;
    }
}
