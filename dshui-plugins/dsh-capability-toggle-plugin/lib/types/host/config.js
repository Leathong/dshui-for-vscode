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
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
/**
 * The storage domain this plugin owns. The backend's unit-name grammar admits
 * lowercase identifiers only — no hyphens — so this is not a package-shaped name.
 */
export const DOMAIN_NAME = 'capability_toggle';
/** One capability's stored stance: only the explicit `on`/`off` are persisted. */
const StanceSchema = z.enum(['on', 'off']);
/** One level's stored override map (capability id to explicit stance). */
const OverrideMapSchema = z.record(z.string(), StanceSchema);
// The global level rides the domain's global singleton because it has no key of
// its own; the two keyed levels are tables, so a write to one session neither
// rewrites another session's stance nor the global one.
export const CapabilityToggleSpec = defineDomain({
    name: DOMAIN_NAME,
    version: 1,
    global: {
        schema: OverrideMapSchema,
        initial: {},
    },
    tables: {
        projects: domainTable(OverrideMapSchema),
        sessions: domainTable(OverrideMapSchema),
    },
});
