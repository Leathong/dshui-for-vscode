/**
 * Loader-config schema and stored-document shape for
 * dsh-capability-toggle-plugin.
 *
 * All three override levels live in ONE Loader configuration entry rather than
 * a session-log event. This is deliberate: `Session.append()` exposes no way to
 * mark a non-surface event `ignorable`, and the persistence read path
 * (`assertEventsSupported`) refuses to reconstruct any log carrying an event
 * type outside the harness's generated `KNOWN_SESSION_EVENT_TYPES` set — an
 * out-of-repo plugin event can never be in that set, so a custom
 * `capability/toggle` session event would brick the session on reload. The
 * Loader configuration persists across restarts too, so the session level (keyed
 * by session id) keeps its survives-reload guarantee without that risk.
 *
 * Model-visible ⟺ logged still holds: this state never becomes model text on
 * its own. Its only model effect — a capability disappearing from the tool
 * schema set or the `<available_skills>` catalog — is emitted and logged by
 * their owners (the `request/header` snapshot and tool-skill's catalog
 * message), which replay recomputes.
 *
 * @module dsh-capability-toggle-plugin/host/config
 */
import z from '@deepseek-ai/schemastery';
import type { OverrideMap } from '../shared/types.ts';
/** The resolved override document (all defaults applied). */
export interface StoredDocument {
    readonly global: OverrideMap;
    readonly projects: Readonly<Record<string, OverrideMap>>;
    readonly sessions: Readonly<Record<string, OverrideMap>>;
}
export interface StoredConfigDocument extends StoredDocument {
    readonly legacyMigrationCompleted: boolean;
}
export declare const StoredDocumentSchema: z<StoredConfigDocument>;
export interface OverrideConfig {
    readonly global: {
        get(): OverrideMap | undefined;
    };
    readonly projects: {
        get(): Readonly<Record<string, OverrideMap>> | undefined;
    };
    readonly sessions: {
        get(): Readonly<Record<string, OverrideMap>> | undefined;
    };
    readonly legacyMigrationCompleted: {
        get(): boolean | undefined;
    };
}
