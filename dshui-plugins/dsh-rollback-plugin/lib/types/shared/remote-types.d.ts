import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { OpenAtResult, RollbackAcceptAllRequest, RollbackAcceptAllResult, RollbackAcceptFileRequest, RollbackAcceptModificationRequest, RollbackAcceptResult, RollbackExecuteRequest, RollbackExecuteResult, RollbackPrepareResult, RollbackPrepareTurnResult, RollbackSessionChangesResult, RollbackStatusResult, RollbackUndoAllRequest, RollbackUndoAllResult, RollbackUndoFileRequest, RollbackUndoFileResult, RollbackUndoModificationRequest, RollbackUndoModificationResult } from './types.ts';
export interface RollbackRemote {
    prepare(sessionId: string, messageId: string): Promise<RemoteResult<RollbackPrepareResult>>;
    execute(request: RollbackExecuteRequest): Promise<RemoteResult<RollbackExecuteResult>>;
    openAt(sessionId: string, path: string, line?: number): Promise<RemoteResult<OpenAtResult>>;
    status(sessionId: string): Promise<RemoteResult<RollbackStatusResult>>;
    prepareTurn(sessionId: string, turn: number): Promise<RemoteResult<RollbackPrepareTurnResult>>;
    sessionChanges(sessionId: string): Promise<RemoteResult<RollbackSessionChangesResult>>;
    acceptAll(request: RollbackAcceptAllRequest): Promise<RemoteResult<RollbackAcceptAllResult>>;
    undoAll(request: RollbackUndoAllRequest): Promise<RemoteResult<RollbackUndoAllResult>>;
    acceptFile(request: RollbackAcceptFileRequest): Promise<RemoteResult<RollbackAcceptResult>>;
    acceptModification(request: RollbackAcceptModificationRequest): Promise<RemoteResult<RollbackAcceptResult>>;
    undoFile(request: RollbackUndoFileRequest): Promise<RemoteResult<RollbackUndoFileResult>>;
    undoModification(request: RollbackUndoModificationRequest): Promise<RemoteResult<RollbackUndoModificationResult>>;
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteMap {
        'rollback/prepare'(sessionId: string, messageId: string): Promise<RemoteResult<RollbackPrepareResult>>;
        'rollback/execute'(request: RollbackExecuteRequest): Promise<RemoteResult<RollbackExecuteResult>>;
        'rollback/openAt'(sessionId: string, path: string, line?: number): Promise<RemoteResult<OpenAtResult>>;
        'rollback/status'(sessionId: string): Promise<RemoteResult<RollbackStatusResult>>;
        'rollback/prepareTurn'(sessionId: string, turn: number): Promise<RemoteResult<RollbackPrepareTurnResult>>;
        'rollback/sessionChanges'(sessionId: string): Promise<RemoteResult<RollbackSessionChangesResult>>;
        'rollback/acceptAll'(request: RollbackAcceptAllRequest): Promise<RemoteResult<RollbackAcceptAllResult>>;
        'rollback/undoAll'(request: RollbackUndoAllRequest): Promise<RemoteResult<RollbackUndoAllResult>>;
        'rollback/acceptFile'(request: RollbackAcceptFileRequest): Promise<RemoteResult<RollbackAcceptResult>>;
        'rollback/acceptModification'(request: RollbackAcceptModificationRequest): Promise<RemoteResult<RollbackAcceptResult>>;
        'rollback/undoFile'(request: RollbackUndoFileRequest): Promise<RemoteResult<RollbackUndoFileResult>>;
        'rollback/undoModification'(request: RollbackUndoModificationRequest): Promise<RemoteResult<RollbackUndoModificationResult>>;
    }
    interface TypertRemoteNamespaceMap {
        rollback: RollbackRemote;
    }
}
