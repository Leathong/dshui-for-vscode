/**
 * Durable-domain schema and stored-document shape for
 * dsh-capability-toggle-plugin.
 *
 * All three override levels live in ONE storage domain rather than a
 * session-log event. This is deliberate: `Session.append()` exposes no way to
 * mark a non-surface event `ignorable`, and the persistence read path
 * (`assertEventsSupported`) refuses to reconstruct any log carrying an event
 * type outside the harness's generated `KNOWN_SESSION_EVENT_TYPES` set — an
 * out-of-repo plugin event can never be in that set, so a custom
 * `capability/toggle` session event would brick the session on reload. The
 * domain persists across restarts too, so the session level (keyed by session
 * id) keeps its survives-reload guarantee without that risk.
 *
 * Model-visible ⟺ logged still holds: this state never becomes model text on
 * its own. Its only model effect — a capability disappearing from the tool
 * schema set or the `<available_skills>` catalog — is emitted and logged by
 * their owners (the `request/header` snapshot and tool-skill's catalog
 * message), which replay recomputes.
 *
 * @module dsh-capability-toggle-plugin/host/config
 */
import { z } from 'zod';
import type { Domain } from '@deepseek-ai/dsh-storage-domain';
import type { OverrideMap, ToggleState } from '../shared/types.ts';
/**
 * The storage domain this plugin owns. The backend's unit-name grammar admits
 * lowercase identifiers only — no hyphens — so this is not a package-shaped name.
 */
export declare const DOMAIN_NAME = "capability_toggle";
/** The mutable form a level's map takes at the durable boundary. */
export type StoredOverrideMap = Record<string, Exclude<ToggleState, 'inherit'>>;
/**
 * The complete stored document: the global level, plus per-project and
 * per-session maps keyed by absolute project root and session id respectively.
 * A silent (absent) entry at any level means `inherit`.
 */
/** The resolved stored document (all defaults applied). */
export interface StoredDocument {
    readonly global: OverrideMap;
    readonly projects: Readonly<Record<string, OverrideMap>>;
    readonly sessions: Readonly<Record<string, OverrideMap>>;
}
export declare const CapabilityToggleSpec: {
    name: string;
    version: number;
    global: {
        schema: z.ZodRecord<z.ZodString, z.ZodEnum<{
            off: "off";
            on: "on";
        }>>;
        initial: {};
    };
    tables: {
        projects: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, StoredOverrideMap>;
        sessions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, StoredOverrideMap>;
    };
};
/** The opened handle type for this plugin's domain. */
export type CapabilityToggleDomain = Domain<typeof CapabilityToggleSpec>;
