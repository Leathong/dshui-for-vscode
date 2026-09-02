/**
 * Whitelist settings store: reads the `sandbox-whitelist` settings namespace
 * through `settingsScope.describe()` and writes `extraWritableRoots` as one
 * revision-checked `settings.mutate`. Split from the React section so the
 * logic is unit-testable without pulling in the browser bundle.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/** The settings-document namespace this section reads/writes. */
export const SETTINGS_NS = 'sandbox-whitelist';
export const SETTINGS_FIELD = 'extraWritableRoots';
export class WhitelistSettingsStore {
    settingsRemote;
    store = createSnapshotStore({
        status: 'loading',
        writable: false,
        roots: [],
        revision: undefined,
    });
    disposed = false;
    describeFace;
    constructor(settingsScope, settingsRemote) {
        this.settingsRemote = settingsRemote;
        this.describeFace = settingsScope.describe();
    }
    getSnapshot() {
        return this.store.getSnapshot();
    }
    subscribe(listener) {
        return this.store.subscribe(listener);
    }
    async load() {
        if (this.disposed)
            return;
        try {
            await this.describeFace.ensure();
        }
        catch {
            // Settings document unavailable (transport error); a later invalidation re-reads.
            return;
        }
        const mirrored = this.describeFace.getSnapshot();
        if (mirrored.view === undefined) {
            // Settings document unavailable (e.g. non-loopback / remote connection).
            this.store.update((draft) => {
                draft.writable = false;
                draft.status = 'unavailable';
                draft.roots = [];
                draft.revision = undefined;
            });
            return;
        }
        const view = mirrored.view.namespaces.find((candidate) => candidate.ns === SETTINGS_NS);
        this.store.update((draft) => {
            draft.writable = mirrored.view.writable === true;
            if (view === undefined) {
                draft.status = 'unavailable';
                draft.roots = [];
                draft.revision = undefined;
                return;
            }
            draft.status = 'ready';
            draft.revision = view.revision;
            draft.roots = Array.isArray(view.value?.extraWritableRoots) ? view.value.extraWritableRoots : [];
        });
    }
    async save(roots) {
        if (this.disposed)
            return { ok: false, error: 'disposed' };
        const revision = this.getSnapshot().revision;
        let response;
        try {
            response = await this.settingsRemote.mutate(SETTINGS_NS, [{ op: 'set', path: [SETTINGS_FIELD], value: roots }], revision);
        }
        catch (error) {
            return { ok: false, error: String(error) };
        }
        if (response.ok !== true)
            return { ok: false, error: response.error?.message ?? 'settings write rejected' };
        await this.load();
        return { ok: true };
    }
    dispose() {
        this.disposed = true;
    }
}
