import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { IconRefreshOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
function isRemoteOk(value) {
    return value.ok;
}
export function RollbackAction(props) {
    const { messageId, prepare, execute, openAt, forkAt, t } = props;
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [scope, setScope] = useState('turn');
    const [paths, setPaths] = useState(new Set());
    const [modificationIds, setModificationIds] = useState(new Set());
    const [createdPolicy, setCreatedPolicy] = useState('keep');
    const [result, setResult] = useState(null);
    const [resultError, setResultError] = useState(null);
    const runPrepare = async () => {
        setOpen(true);
        setLoading(true);
        setError(null);
        setResult(null);
        setResultError(null);
        let remote;
        try {
            remote = await prepare(messageId);
        }
        catch (prepareError) {
            setError(prepareError instanceof Error ? prepareError.message : String(prepareError));
            setLoading(false);
            return;
        }
        if (!isRemoteOk(remote)) {
            setError(remote.error.message);
            setLoading(false);
            return;
        }
        const business = remote.value;
        if (!business.ok) {
            setError(business.error.message);
            setLoading(false);
            return;
        }
        const loaded = business.value;
        setData(loaded);
        setScope('turn');
        setPaths(new Set(loaded.changes.filter(change => change.restorable).map(change => change.path)));
        setModificationIds(new Set(loaded.modifications.filter(item => item.restorable === 'merge').map(item => item.modificationId)));
        setLoading(false);
    };
    const runExecute = async () => {
        if (data === null)
            return;
        setResult(null);
        setResultError(null);
        const base = { confirmed: true, createdPolicy, prepareId: data.prepareId };
        const request = scope === 'turn'
            ? { ...base, scope: 'turn' }
            : scope === 'files'
                ? { ...base, scope: 'files', paths: [...paths] }
                : { ...base, scope: 'modifications', modificationIds: [...modificationIds] };
        const remote = await execute(messageId, request).catch((executeError) => {
            setResultError(executeError instanceof Error ? executeError.message : String(executeError));
            return null;
        });
        if (remote === null)
            return;
        if (!isRemoteOk(remote)) {
            setResultError(remote.error.message);
            return;
        }
        const business = remote.value;
        if (!business.ok) {
            setResultError(business.error.message);
            return;
        }
        const value = business.value;
        setResult(value);
        if (scope === 'turn' && value.forkAnchor !== undefined) {
            try {
                await forkAt(value.forkAnchor);
            }
            catch (forkError) {
                setResultError(`${String(forkError)} (files were restored; guardId ${value.guardId})`);
            }
        }
    };
    const togglePath = (path) => {
        const next = new Set(paths);
        if (next.has(path))
            next.delete(path);
        else
            next.add(path);
        setPaths(next);
    };
    const toggleModification = (id) => {
        const next = new Set(modificationIds);
        if (next.has(id))
            next.delete(id);
        else
            next.add(id);
        setModificationIds(next);
    };
    const fileRows = useMemo(() => {
        const changes = data?.changes ?? [];
        const mods = data?.modifications ?? [];
        return changes.map(change => (_jsx(FileRow, { change: change, selected: paths.has(change.path), onToggle: () => { togglePath(change.path); }, onOpen: line => { void openAt(change.path, line).then(() => undefined); }, t: t, modifications: mods.filter(item => item.path === change.path), selectedModifications: modificationIds, onToggleModification: toggleModification, modificationScope: scope === 'modifications' }, change.path)));
    }, [data, paths, modificationIds, scope, t]);
    return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center' }, children: [_jsx(Tooltip, { label: t('action'), side: "bottom", children: _jsx("button", { type: "button", className: "dsh-rollback-action", "aria-label": t('action'), onClick: () => { void runPrepare(); }, children: _jsx(IconRefreshOutline16, {}) }) }), open ? (_jsx("div", { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }, onClick: () => { setOpen(false); }, children: _jsxs("div", { style: { background: 'var(--dsw-color-bg, #fff)', color: 'var(--dsw-color-text, #111)', borderRadius: 12, padding: 16, maxWidth: 780, width: 'min(92vw, 780px)', maxHeight: '82vh', overflow: 'auto' }, onClick: event => { event.stopPropagation(); }, children: [_jsx("h3", { style: { marginTop: 0 }, children: t('title') }), loading ? _jsx("div", { children: t('loading') }) : null, error !== null ? _jsxs("div", { children: [t('failed'), ": ", error] }) : null, data !== null ? (_jsxs(_Fragment, { children: [_jsxs("div", { children: [t('snapshot'), ": turn ", data.snapshot.turn, " \u00B7 ", new Date(data.snapshot.createdAt).toLocaleString(), data.snapshot.degraded === true ? ` · ${t('degraded')}` : ''] }), _jsxs("div", { children: [t('targetTurn'), ": ", data.boundary.targetTurn, data.boundary.forkAvailable === false ? ` · ${t('turn1NoFork')}` : ''] }), _jsxs("div", { style: { display: 'flex', gap: 12, margin: '10px 0' }, children: [_jsxs("label", { children: [_jsx("input", { type: "radio", checked: scope === 'turn', onChange: () => { setScope('turn'); } }), t('wholeTurn')] }), _jsxs("label", { children: [_jsx("input", { type: "radio", checked: scope === 'files', onChange: () => { setScope('files'); } }), t('selectedFiles')] }), _jsxs("label", { children: [_jsx("input", { type: "radio", checked: scope === 'modifications', onChange: () => { setScope('modifications'); } }), t('selectedModifications')] })] }), _jsxs("label", { style: { display: 'block', marginBottom: 8 }, children: [_jsx("input", { type: "checkbox", checked: createdPolicy === 'delete', onChange: event => { setCreatedPolicy(event.target.checked ? 'delete' : 'keep'); } }), t('createdPolicy.delete')] }), _jsxs("div", { children: [_jsx("h4", { children: t('changes') }), fileRows.length === 0 ? _jsx("div", { children: t('empty') }) : fileRows] }), data.warnings.length > 0 ? (_jsx("div", { style: { marginTop: 8, opacity: .8 }, children: data.warnings.join(' · ') })) : null, result !== null ? _jsxs("div", { style: { marginTop: 8 }, children: [t('success'), ": ", result.restored.length, " restored, ", result.kept.length, " kept, ", result.deleted.length, " deleted"] }) : null, resultError !== null ? _jsxs("div", { style: { marginTop: 8 }, children: [t('failed'), ": ", resultError] }) : null, _jsxs("div", { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }, children: [_jsx("button", { type: "button", onClick: () => { setOpen(false); }, children: t('cancel') }), _jsx("button", { type: "button", onClick: () => { void runExecute(); }, children: t('confirm') })] })] })) : null] }) })) : null] }));
}
function FileRow(props) {
    const { change, selected, onToggle, onOpen, t, modifications, selectedModifications, onToggleModification, modificationScope } = props;
    return (_jsxs("div", { style: { margin: '6px 0', padding: 6, border: '1px solid rgba(128,128,128,.25)', borderRadius: 8 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [change.restorable ? _jsx("input", { type: "checkbox", checked: selected, onChange: onToggle }) : null, _jsx("button", { type: "button", style: { textDecoration: 'underline', background: 'none', border: 0, padding: 0, cursor: 'pointer' }, onClick: () => { onOpen(change.hunks?.[0]?.newLine); }, children: change.path }), _jsx("span", { style: { opacity: .75 }, children: t(`status.${change.status}`) }), change.createdAfterSnapshot === true ? _jsx("span", { children: t('status.created') }) : null] }), modificationScope && modifications.length > 0 ? (_jsx("div", { style: { marginLeft: 20 }, children: modifications.map(item => (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsx("input", { type: "checkbox", checked: selectedModifications.has(item.modificationId), onChange: () => { onToggleModification(item.modificationId); } }), _jsxs("span", { children: [item.toolName, " #", item.modificationId] }), _jsx("span", { style: { opacity: .75 }, children: item.restorable === 'merge' ? t('merge') : item.restorable === 'file-only' ? t('fileOnly') : t('unsupported') }), item.laterModificationIds !== undefined && item.laterModificationIds.length > 0 ? _jsx("span", { style: { color: '#b8860b' }, children: t('conflictRisk') }) : null, item.reason !== undefined ? _jsx("span", { style: { opacity: .7 }, children: item.reason }) : null] }, item.modificationId))) })) : null, change.hunks !== undefined && change.hunks.length > 0 ? (_jsx("pre", { style: { margin: '6px 0 0', fontSize: 11, maxHeight: 160, overflow: 'auto', background: 'rgba(0,0,0,.04)', padding: 6 }, children: change.hunks.map((hunk, index) => `${hunk.oldText ?? ''}\n${hunk.newText}`).join(`\n---\n`) })) : null] }));
}
