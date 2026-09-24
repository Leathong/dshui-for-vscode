/**
 * Browser half of dsh-capability-toggle-plugin — the composer-row entry point.
 *
 * Registers one control into the composer tool row (`conversation.input.left`):
 * a small toggle button that opens the capability popup. This module owns only
 * the control host (open/close, load-on-open, out-of-click/Escape dismissal,
 * the request-ordering guard, and the write callback) plus the plugin wiring;
 * the popup's presentation lives in ./components.tsx and the two same-origin
 * HTTP calls live in ./api.ts.
 *
 * The button and every switch are disabled while the agent is running — toggles
 * apply only when the agent is idle, per the plugin's contract. State is read
 * from and written to the Host over the ./api.ts routes; the Host owns
 * persistence and enforcement.
 *
 * The component is authored with React from the loader's module table and needs
 * no framework client types at build time (see ./types.ts for why the platform
 * slot/locale types are declared locally).
 *
 * @module dsh-capability-toggle-plugin/client
 */
import type { ClientContext } from './types.ts';
/** Cordis plugin name (client half). */
export declare const name = "dsh-capability-toggle-plugin/client";
/** Services this client half injects. */
export declare const inject: string[];
/**
 * Client plugin body: install the dictionaries and the composer-row control.
 * @param ctx - the client root context (narrowed locally; see ./types.ts).
 */
export declare function apply(ctx: ClientContext): void;
