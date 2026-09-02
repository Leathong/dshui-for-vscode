/**
 * dsh-whitelist-sandbox, browser half: a `settings.section` for the sandbox
 * whitelist.
 *
 * Security contract (mirrors the host plugin's):
 *  - The form reads/writes ONLY the `sandbox-whitelist:` settings-document
 *    section through the existing settings transport
 *    (`settingsScope.describe()` + `ctx.remote.settings.mutate`) — the same
 *    channel the Models page uses. There is no second, bypass write path.
 *  - The authoritative guard (reject roots covering $DSH_HOME /
 *    settings.yaml, keep-last-good) runs host-side in dsh-whitelist-sandbox
 *    when the change is applied; the UI shows the document value and a
 *    notice that final application is subject to that guard.
 *  - Nothing model-controlled is ever rendered into this form; inputs are
 *    operator-typed paths only.
 */
import { useSyncExternalStore, useState } from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { Button, Input, IconTrashOutline16, IconPlusOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';
import { WhitelistSettingsStore } from "./store.js";
import { COPY_NS, zh, en } from "./locales.js";
/** The settings-page section: edit the whitelist path list, save via the document. */
export function WhitelistSection({ controller, t }) {
    // React calls subscribe/getSnapshot as bare functions (this === undefined),
    // so the store methods must be bound through closures, not passed unbound.
    const state = useSyncExternalStore((listener) => controller.subscribe(listener), () => controller.getSnapshot());
    const [draft, setDraft] = useState('');
    const [pending, setPending] = useState(null);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);
    const storeRoots = state.status === 'ready' ? state.roots : [];
    const roots = pending === null ? storeRoots : pending;
    const dirty = pending !== null;
    const mark = (next) => {
        setPending(next);
        setNotice(null);
    };
    const add = () => {
        const value = draft.trim();
        if (value === '')
            return;
        mark([...roots, value]);
        setDraft('');
    };
    const remove = (index) => {
        mark(roots.filter((_, cursor) => cursor !== index));
    };
    const save = async () => {
        setSaving(true);
        try {
            const result = await controller.save(roots);
            if (result.ok) {
                setPending(null);
                setNotice({ ok: true, message: t('saved') });
            }
            else {
                setNotice({ ok: false, message: t('saveFailed') + result.error });
            }
        }
        finally {
            setSaving(false);
        }
    };
    const row = (index, path) => jsx('li', {
        key: index,
        style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' },
        children: [
            jsx('span', { style: { flex: '1', overflowWrap: 'anywhere', fontFamily: 'monospace', fontSize: '12px' }, children: path }),
            jsx(Button, {
                variant: 'ghost',
                size: 'sm',
                icon: jsx(IconTrashOutline16, {}),
                'aria-label': t('remove'),
                onClick: () => remove(index),
            }),
        ],
    });
    const editable = state.writable && state.status === 'ready';
    return jsxs('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '720px' },
        children: [
            jsx('p', { style: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '1.6' }, children: t('hint') }),
            state.status === 'loading' && jsx('p', { children: t('loading') }),
            state.status === 'unavailable' && jsx('p', { role: 'alert', children: t('notLoaded') }),
            jsx('ul', {
                style: { listStyle: 'none', margin: 0, padding: 0 },
                children: roots.map((path, index) => row(index, path)),
            }),
            jsxs('div', {
                style: { display: 'flex', gap: '8px', alignItems: 'center' },
                children: [
                    jsx(Input, {
                        style: { flex: '1' },
                        value: draft,
                        placeholder: t('addPlaceholder'),
                        disabled: !editable,
                        onChange: (event) => setDraft(event.target.value),
                        onKeyDown: (event) => {
                            if (event.key === 'Enter')
                                add();
                        },
                    }),
                    jsx(Button, {
                        variant: 'outline',
                        size: 'sm',
                        icon: jsx(IconPlusOutline16, {}),
                        disabled: !editable || draft.trim() === '',
                        onClick: add,
                        children: t('add'),
                    }),
                ],
            }),
            jsxs('div', {
                style: { display: 'flex', gap: '12px', alignItems: 'center' },
                children: [
                    jsx(Button, {
                        variant: 'primary',
                        size: 'sm',
                        disabled: !editable || saving || !dirty,
                        onClick: save,
                        children: t('save'),
                    }),
                    dirty && jsx('span', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }, children: t('unsaved') }),
                    notice !== null && jsx('span', {
                        role: notice.ok ? 'status' : 'alert',
                        style: { color: notice.ok ? 'var(--dsw-alias-ok)' : 'var(--dsw-alias-danger)', fontSize: '12px' },
                        children: notice.message,
                    }),
                ],
            }),
            !state.writable && state.status !== 'loading' && jsx('p', { style: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }, children: t('readonly') }),
        ],
    });
}
/**
 * Required client services. Both the base `remote` service and the
 * `remote.settings` namespace must be injected: `ctx.remote` builds the
 * accessor receiver, and `remote.settings` (the settings-document Remote
 * namespace mounted by dsh-api-remotes) is the exposed sub-service the
 * section reads/writes through `ctx.remote.settings`.
 */
export const inject = ['slots', 'locale', 'settingsScope', 'remote', 'remote.settings'];
/**
 * Register the whitelist section once the `settings.section` declaration
 * is on the ledger, wire its store to the settings scope, and refresh on
 * every pushed settings invalidation.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(COPY_NS, { zh, en }), 'dsh-whitelist-sandbox: dictionaries');
    const t = ctx.locale.bind(COPY_NS);
    const controller = new WhitelistSettingsStore(ctx.settingsScope, ctx.remote.settings);
    const injected = () => ({ controller, t });
    ctx.effect(() => {
        const refresh = () => {
            controller.load();
        };
        controller.load();
        const dispose = controller.describeFace.subscribe(refresh);
        return () => {
            dispose();
            controller.dispose();
        };
    }, 'dsh-whitelist-sandbox: settings scope');
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'whitelist',
        order: 20,
        label: () => t('nav'),
        inject: injected,
    }, WhitelistSection));
}
export { WhitelistSettingsStore } from "./store.js";
