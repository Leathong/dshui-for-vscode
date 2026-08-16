import { jsonCodec } from "../shared/json-codec.js";
const packageName = 'dsh-rollback-plugin';
function parameter(name) {
    return { name, wire: name, source: 'json', codec: jsonCodec('dsh-rollback-plugin#JsonValue') };
}
/** Consumer-side contribution; mirrors the Host descriptors in ../host/typert.ts. */
export const ROLLBACK_REMOTE = {
    package: packageName,
    descriptors: [
        {
            id: `${packageName}#rollback/prepare`,
            service: 'rollback',
            namespace: 'rollback',
            method: 'prepare',
            invocation: { kind: 'direct' },
            parameters: [parameter('sessionId'), parameter('messageId')],
            cancellation: { parameter: 'signal' },
            result: jsonCodec('dsh-rollback-plugin#RemoteResult'),
        },
        {
            id: `${packageName}#rollback/execute`,
            service: 'rollback',
            namespace: 'rollback',
            method: 'execute',
            invocation: { kind: 'direct' },
            parameters: [parameter('request')],
            cancellation: { parameter: 'signal' },
            result: jsonCodec('dsh-rollback-plugin#RemoteResult'),
        },
        {
            id: `${packageName}#rollback/openAt`,
            service: 'rollback',
            namespace: 'rollback',
            method: 'openAt',
            invocation: { kind: 'direct' },
            parameters: [parameter('sessionId'), parameter('path'), parameter('line')],
            cancellation: { parameter: 'signal' },
            result: jsonCodec('dsh-rollback-plugin#RemoteResult'),
        },
        {
            id: `${packageName}#rollback/status`,
            service: 'rollback',
            namespace: 'rollback',
            method: 'status',
            invocation: { kind: 'direct' },
            parameters: [parameter('sessionId')],
            cancellation: { parameter: 'signal' },
            result: jsonCodec('dsh-rollback-plugin#RemoteResult'),
        },
    ],
};
export default ROLLBACK_REMOTE;
