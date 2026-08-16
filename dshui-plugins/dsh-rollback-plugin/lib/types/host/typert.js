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
    ],
};
/** Consumer-side Remote contribution mounted by the client bundle. */
export const ROLLBACK_REMOTE = {
    package: ROLLBACK_PACKAGE,
    descriptors: ROLLBACK_HOST_TYPERT.invocations,
};
