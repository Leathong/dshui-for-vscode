import { jsonCodec } from "../shared/json-codec.js";
export const ROLLBACK_PACKAGE = 'dsh-rollback-plugin';
function invocation(method, parameters, withSignal) {
    return {
        id: `${ROLLBACK_PACKAGE}#rollback/${method}`,
        service: 'rollback',
        namespace: 'rollback',
        method,
        invocation: { kind: 'direct' },
        parameters,
        ...(withSignal ? { cancellation: { parameter: 'signal' } } : {}),
        result: jsonCodec('dsh-rollback-plugin#RemoteResult'),
    };
}
/** Hand-written Host Typert contribution with strict JSON codecs. */
export const ROLLBACK_HOST_TYPERT = {
    package: ROLLBACK_PACKAGE,
    face: 'host',
    schemas: [],
    model: {
        services: [{
                key: 'rollback',
                exportName: 'RollbackService',
                summary: 'Message-level workspace rollback with file and tool-modification granularity.',
                tags: [],
                members: [
                    { kind: 'method', name: 'prepare', signature: '@Remote prepare(sessionId: string, messageId: string, signal?: AbortSignal): Promise<RollbackPrepareResult>' },
                    { kind: 'method', name: 'execute', signature: '@Remote execute(request: RollbackExecuteRequest, signal?: AbortSignal): Promise<RollbackExecuteResult>' },
                    { kind: 'method', name: 'openAt', signature: '@Remote openAt(sessionId: string, path: string, line?: number, signal?: AbortSignal): Promise<OpenAtResult>' },
                    { kind: 'method', name: 'status', signature: '@Remote status(sessionId: string, signal?: AbortSignal): Promise<RollbackStatusResult>' },
                    { kind: 'method', name: 'prepareTurn', signature: '@Remote prepareTurn(sessionId: string, turn: number, signal?: AbortSignal): Promise<RollbackPrepareTurnResult>' },
                    { kind: 'method', name: 'acceptAll', signature: '@Remote acceptAll(request: RollbackAcceptAllRequest, signal?: AbortSignal): Promise<RollbackAcceptAllResult>' },
                    { kind: 'method', name: 'undoAll', signature: '@Remote undoAll(request: RollbackUndoAllRequest, signal?: AbortSignal): Promise<RollbackUndoAllResult>' },
                    { kind: 'method', name: 'sessionChanges', signature: '@Remote sessionChanges(sessionId: string, signal?: AbortSignal): Promise<RollbackSessionChangesResult>' },
                    { kind: 'method', name: 'acceptFile', signature: '@Remote acceptFile(request: RollbackAcceptFileRequest, signal?: AbortSignal): Promise<RollbackAcceptResult>' },
                    { kind: 'method', name: 'acceptModification', signature: '@Remote acceptModification(request: RollbackAcceptModificationRequest, signal?: AbortSignal): Promise<RollbackAcceptResult>' },
                    { kind: 'method', name: 'undoFile', signature: '@Remote undoFile(request: RollbackUndoFileRequest, signal?: AbortSignal): Promise<RollbackUndoFileResult>' },
                    { kind: 'method', name: 'undoModification', signature: '@Remote undoModification(request: RollbackUndoModificationRequest, signal?: AbortSignal): Promise<RollbackUndoModificationResult>' },
                ],
                types: [],
            }],
        events: [],
        objects: [],
    },
    invocations: [
        invocation('prepare', [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
            { name: 'messageId', wire: 'messageId', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('execute', [
            { name: 'request', wire: 'request', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('openAt', [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
            { name: 'path', wire: 'path', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
            { name: 'line', wire: 'line', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('status', [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('prepareTurn', [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
            { name: 'turn', wire: 'turn', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('acceptAll', [
            { name: 'request', wire: 'request', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('undoAll', [
            { name: 'request', wire: 'request', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('sessionChanges', [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('acceptFile', [
            { name: 'request', wire: 'request', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('acceptModification', [
            { name: 'request', wire: 'request', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('undoFile', [
            { name: 'request', wire: 'request', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
        invocation('undoModification', [
            { name: 'request', wire: 'request', source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') },
        ], true),
    ],
};
/** Consumer-side Remote contribution mounted by the client bundle. */
export const ROLLBACK_REMOTE = {
    package: ROLLBACK_PACKAGE,
    descriptors: ROLLBACK_HOST_TYPERT.invocations,
};
