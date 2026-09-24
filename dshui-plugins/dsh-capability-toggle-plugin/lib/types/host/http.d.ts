/**
 * HTTP bridge between the browser panel and the Host controller. Registers two
 * routes on the shared web server (same origin as the GUI, so the client uses
 * relative fetch and inherits its auth):
 *
 *   GET  /api/plugin/capability-toggle/state?session=<id>
 *        -> { projection: CapabilityToggleProjection } for that session's agent,
 *           or 404 when the agent is not live.
 *   POST /api/plugin/capability-toggle/set
 *        body { session, level, id, state } -> writes one stance and returns the
 *           refreshed projection.
 *   POST /api/plugin/capability-toggle/set-many
 *        body { session, level, ids, state } -> writes the same stance to every
 *           listed id in one domain write, and returns the refreshed
 *           projection. Backs the panel's bulk-toolbar (enable/disable/clear a
 *           filtered tab's visible rows at one level).
 *
 * This is a Host-owned control channel, not model-visible state, so it lives off
 * the session log entirely (see host/config.ts for why the state is not a
 * session event). Every write lands in this plugin's storage domain, whose
 * commit event drives reconcile on every affected agent.
 *
 * @module dsh-capability-toggle-plugin/host/http
 */
import type { IncomingMessage } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import type { ToggleLevel, ToggleState } from '../shared/types.ts';
import type { ConfirmationCenter } from './confirm.ts';
import type { ControllerRegistry } from './controller.ts';
import type { OverrideStore } from './store.ts';
/** URL path prefix this plugin claims on the web server. */
export declare const ROUTE_PREFIX = "/api/plugin/capability-toggle";
/** Parsed and validated body of a set request. */
export interface SetBody {
    readonly session: string;
    readonly level: ToggleLevel;
    readonly id: string;
    readonly state: ToggleState;
}
/** Parsed and validated body of a set-many (bulk) request. */
export interface SetManyBody {
    readonly session: string;
    readonly level: ToggleLevel;
    readonly ids: readonly string[];
    readonly state: ToggleState;
}
/** Parsed and validated body of a confirmation response. */
export interface RespondBody {
    readonly session: string;
    readonly id: string;
    readonly decision: 'allow' | 'deny';
}
/**
 * Install the HTTP routes. Returns the composed disposer.
 * @param ctx - the Host context (must inject `webServer`).
 * @param store - the shared override store.
 * @param registry - the live-agent controller registry.
 * @returns a disposer that unregisters every route.
 */
export declare function installHttp(ctx: Context, store: OverrideStore, registry: ControllerRegistry, center: ConfirmationCenter): () => void;
/**
 * Resolve the official Connection authentication seam. Named WebServer routes
 * bypass the `/api` RPC channel and the static-fallback authentication, so the
 * plugin MUST apply `connection.requestRejection(req)` itself.
 *
 * Resolved PER REQUEST, never captured at install time: a one-shot capture at
 * `installHttp` returned `() => 503` on a real restart (the service was not yet
 * resolvable), which failed EVERY route closed — the panel then reported "no
 * running agent" and showed no switches at all. `connection` is also declared in
 * the plugin's `inject`, so the framework does not call `apply` before the
 * service exists; the lazy read is the second half of the guarantee. If the seam
 * is genuinely absent the request still fails closed, but as a per-request 503
 * rather than a route that can never recover.
 */
export declare function resolveAuthForTest(ctx: Context): RequestRejection;
type RequestRejection = (req: IncomingMessage) => number | undefined;
/**
 * Validate an unknown parsed body into a SetBody, throwing on any deviation.
 * Exported (not a route-private helper) so its rejection/accept paths can be
 * unit-tested without a live `IncomingMessage`/`ServerResponse` pair.
 */
export declare function parseSetBody(raw: unknown): SetBody;
/**
 * Validate an unknown parsed body into a SetManyBody, throwing on any
 * deviation. Exported for the same unit-testability reason as
 * {@link parseSetBody}.
 */
export declare function parseSetManyBody(raw: unknown): SetManyBody;
/**
 * Validate an unknown parsed body into a RespondBody, throwing on any
 * deviation. Exported for the same unit-testability reason as
 * {@link parseSetBody}.
 */
export declare function parseRespondBody(raw: unknown): RespondBody;
export {};
