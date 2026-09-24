/**
 * Same-origin HTTP client for the composer panel. Two thin wrappers over the
 * Host's read/write routes (see host/http.ts): both resolve to the refreshed
 * projection, or `null` on any transport or Host error so the caller can fall
 * back to the "unavailable" panel state without a try/catch at the call site.
 *
 * @module dsh-capability-toggle-plugin/client/api
 */
import type { CapabilityToggleProjection } from '../shared/types.ts';
import type { ConfirmPush, ConfirmResponse, SetManyRequest, SetRequest } from './types.ts';
/** Fetch one session's projection; null on any transport or Host error. */
export declare function fetchState(session: string): Promise<CapabilityToggleProjection | null>;
/** Write one stance; returns the refreshed projection, or null on failure. */
export declare function writeState(req: SetRequest): Promise<CapabilityToggleProjection | null>;
/** Write one stance to every listed id; returns the refreshed projection, or null on failure. */
export declare function writeStateMany(req: SetManyRequest): Promise<CapabilityToggleProjection | null>;
export declare function subscribeConfirm(session: string, onPush: (push: ConfirmPush) => void): () => void;
export declare function respondConfirm(session: string, id: string, decision: 'allow' | 'deny'): Promise<ConfirmResponse>;
