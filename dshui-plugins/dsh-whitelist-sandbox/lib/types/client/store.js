/**
 * Whitelist settings store: the browser-side projection of this plugin's own
 * profile entry, read and written through the shared `configForms` service.
 * The entry id IS the settings namespace (0.1.7 moved settings from
 * `$DSH_HOME/settings.yaml` sections into the profile patch document, keyed by
 * loader entry id), and `extraWritableRoots` is the one volatile field.
 * Split from the React section so the logic is unit-testable without pulling
 * in the browser bundle.
 */
/** This plugin's profile entry id — the settings namespace its Host row
 * carries. Must match `cordis.patch.yml`'s inserted id. */
export const SETTINGS_NS = 'dsh-whitelist-sandbox';
/** The single config field this page edits. */
export const SETTINGS_FIELD = 'extraWritableRoots';
/**
 * Read-only projection plus the one write of `extraWritableRoots`. The derived
 * snapshot is cached by the underlying form snapshot's identity so
 * `useSyncExternalStore` sees a stable reference between real changes.
 */
export class WhitelistSettingsStore {
    form;
    lastForm;
    cached = { status: 'loading', writable: false, roots: [], revision: undefined };
    constructor(form) {
        this.form = form;
    }
    getSnapshot() {
        const snapshot = this.form.getSnapshot();
        if (snapshot !== this.lastForm) {
            this.lastForm = snapshot;
            this.cached = {
                status: snapshot.status,
                writable: snapshot.writable,
                roots: snapshot.status === 'ready' && Array.isArray(snapshot.value?.extraWritableRoots)
                    ? [...snapshot.value.extraWritableRoots]
                    : [],
                revision: snapshot.revision,
            };
        }
        return this.cached;
    }
    subscribe(listener) {
        return this.form.subscribe(listener);
    }
    async save(roots) {
        let accepted;
        try {
            accepted = await this.form.set(SETTINGS_FIELD, roots);
        }
        catch (error) {
            return { ok: false, error: String(error) };
        }
        return accepted ? { ok: true } : { ok: false, error: 'settings write rejected' };
    }
    /** The form is owned by the shared `configForms` provider; nothing to release. */
    dispose() { }
}
