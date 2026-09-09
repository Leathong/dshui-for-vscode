import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { IconChecklistOutline14, IconCheckOutline14, IconChevronDownOutline14, IconChevronUpOutline14, IconRefreshOutline14, IconRightUpOutline16, IconWarningOutline16, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { IconUndoOutline14 } from "./icons.js";
function unwrapRemote(remote) {
    if (!remote.ok)
        return remote.error.message;
    const business = remote.value;
    if (!business.ok)
        return business.error.message;
    return business.value;
}
/**
 * Whether an event-window delta listed a change that can alter the
 * modification list. Surface events (user/assistant messages, stream chunks)
 * are deliberately excluded — they fire continuously and never change the
 * file set, so reloading on them would only burn list/echo/diff work. Tool
 * results and turn boundaries are the moments a tool actually wrote a file or
 * the snapshot baseline advanced.
 */
function isModificationRelevant(entries) {
    for (const entry of entries) {
        if (entry.type !== 'event')
            continue;
        const type = entry.event.type;
        if (type === 'tool/result' || type === 'turn/start' || type === 'turn/end')
            return true;
    }
    return false;
}
export function ModificationDock(props) {
    const { session, t, sessionEvents, sessionChanges, acceptAll, undoAll, acceptFile, acceptModification, undoFile, undoModification, openAt } = props;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [collapsed, setCollapsed] = useState(false);
    const [showAccepted, setShowAccepted] = useState(false);
    const [busy, setBusy] = useState(new Set());
    const [confirming, setConfirming] = useState(null);
    const [confirmingAll, setConfirmingAll] = useState(false);
    const [actionError, setActionError] = useState(null);
    const dataRef = useRef(null);
    dataRef.current = data;
    const loadingRef = useRef(false);
    const queuedRef = useRef(false);
    // `background` skips the header loading indicator: the session-event
    // refresh (below) re-lists as tool results land, and flashing "…" on every
    // one is noisy. Foreground loads (mount, session edges, mutations, the
    // extension's refresh message) keep the indicator.
    const load = async (background = false) => {
        if (loadingRef.current) {
            queuedRef.current = true;
            return;
        }
        loadingRef.current = true;
        if (!background)
            setLoading(true);
        try {
            const remote = await sessionChanges().catch((loadError) => {
                setError(loadError instanceof Error ? loadError.message : String(loadError));
                return null;
            });
            if (remote === null)
                return;
            const value = unwrapRemote(remote);
            if (typeof value === 'string') {
                setError(value);
                return;
            }
            setData(value);
            setError(null);
            setActionError(null);
        }
        finally {
            loadingRef.current = false;
            if (!background)
                setLoading(false);
            if (queuedRef.current) {
                queuedRef.current = false;
                void load(background);
            }
        }
    };
    // Reload on mount and whenever the Session snapshot moves on (open, queue,
    // running transitions, subagent changes). `session` identity is stable
    // across mid-turn tool calls, so this alone would leave the list stale
    // until the turn's running edge lands (or the user switches sessions and
    // forces a remount); the session-event subscription below closes that gap.
    const mounted = useRef(false);
    useEffect(() => {
        const timer = setTimeout(() => {
            void load();
        }, mounted.current ? 300 : 0);
        mounted.current = true;
        return () => clearTimeout(timer);
    }, [session]);
    const changes = data?.changes ?? [];
    const unaccepted = changes.filter(change => change.accepted !== true);
    const acceptedFiles = changes.filter(change => change.accepted === true);
    const markBusy = (key) => {
        setBusy(prev => new Set(prev).add(key));
    };
    const unmarkBusy = (key) => {
        setBusy(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
        });
    };
    const runMutation = async (key, call) => {
        markBusy(key);
        setActionError(null);
        try {
            const remote = await call().catch((mutationError) => {
                setActionError(mutationError instanceof Error ? mutationError.message : String(mutationError));
                return null;
            });
            if (remote === null)
                return false;
            if (!remote.ok) {
                setActionError(remote.error.message);
                return false;
            }
            const business = remote.value;
            if (!business.ok) {
                setActionError(business.error.message);
                if ('code' in business.error && business.error.code === 'workspace-changed')
                    void load();
                return false;
            }
            return true;
        }
        finally {
            unmarkBusy(key);
        }
    };
    const runAcceptFile = async (change) => {
        const current = dataRef.current;
        if (current === null)
            return;
        const ok = await runMutation(`file:${change.path}`, () => acceptFile(change.path, current.listId));
        if (ok)
            void load();
    };
    const runAcceptModification = async (mod) => {
        const current = dataRef.current;
        if (current === null)
            return;
        const ok = await runMutation(`mod:${mod.modificationId}`, () => acceptModification(mod.modificationId, mod.path, current.listId));
        if (ok)
            void load();
    };
    const runUndoFile = async (change) => {
        setConfirming(null);
        const current = dataRef.current;
        if (current === null)
            return;
        const ok = await runMutation(`file:${change.path}`, () => undoFile(change.path, current.listId));
        if (ok)
            void load();
    };
    const runUndoModification = async (mod) => {
        setConfirming(null);
        const current = dataRef.current;
        if (current === null)
            return;
        const ok = await runMutation(`mod:${mod.modificationId}`, () => undoModification(mod.modificationId, current.listId));
        if (ok)
            void load();
    };
    const runAcceptAll = async () => {
        const current = dataRef.current;
        if (current === null)
            return;
        const ok = await runMutation('all', () => acceptAll(current.listId));
        if (ok)
            void load();
    };
    const runUndoAll = async () => {
        setConfirmingAll(false);
        const current = dataRef.current;
        if (current === null)
            return;
        const ok = await runMutation('all', () => undoAll(current.listId));
        if (ok)
            void load();
    };
    const openFile = (change) => {
        const firstHunk = change.hunks?.[0] ?? change.toolCalls?.[0]?.hunks?.[0];
        void openAt(change.path, firstHunk?.firstChangedNewLine ?? firstHunk?.newLine).then(() => undefined);
    };
    const openReview = (path) => {
        const current = dataRef.current;
        if (current === null)
            return;
        const change = current.changes.find(item => item.path === path);
        const payload = {
            type: 'dshui:reviewModifications',
            sessionId: props.session.sessionId,
            listId: current.listId,
            path,
            ...(change === undefined ? {} : { change }),
        };
        if (typeof window !== 'undefined' && window.parent !== window) {
            window.parent.postMessage(payload, '*');
            return;
        }
        // Outside the VS Code shell (plain browser): keep the previous open-at
        // behaviour so the list stays usable.
        if (change !== undefined)
            openFile(change);
    };
    // The VS Code extension may refresh the modification list after an accept /
    // undo performed from the editor review panel.
    const loadRef = useRef(() => { });
    loadRef.current = (background = false) => { void load(background); };
    useEffect(() => {
        const onMessage = (event) => {
            const data = event.data;
            if (data !== null && typeof data === 'object' && data.type === 'dshui:modificationsChanged') {
                loadRef.current();
            }
        };
        window.addEventListener('message', onMessage);
        return () => { window.removeEventListener('message', onMessage); };
    }, []);
    // Host→client push signal: the session's event window fires synchronously as
    // the host appends session events. We re-list when a tool result or turn
    // boundary lands — the moments a tool actually wrote a file or the snapshot
    // baseline advanced — instead of polling on a timer. Surface events (stream
    // chunks, messages) are ignored, and the delta is debounced so a burst of
    // tool results coalesces into one refresh.
    useEffect(() => {
        if (sessionEvents === undefined)
            return;
        let timer;
        const onEvent = () => {
            const window = sessionEvents.getSnapshot();
            // The seeding baseline is a `replace`; the dock already reads it on mount.
            if (window.change.kind === 'replace')
                return;
            // Only delta kinds carry entries; a settlement carries no modification
            // change (surface event, like stream chunks) and never alters the set.
            if (window.change.kind !== 'prepend' && window.change.kind !== 'append')
                return;
            if (!isModificationRelevant(window.change.entries))
                return;
            if (timer !== undefined)
                clearTimeout(timer);
            timer = setTimeout(() => {
                timer = undefined;
                loadRef.current(true);
            }, 2000);
        };
        return sessionEvents.subscribe(onEvent);
    }, [sessionEvents]);
    // Nothing to show: no modifications, no error worth surfacing.
    if (data !== null && changes.length === 0)
        return null;
    if (data === null && error === null)
        return null;
    const allBusy = busy.has('all');
    return (_jsx("div", { className: "dsh-mod-dock", children: _jsxs("div", { className: "dsh-mod-panel", children: [_jsxs("div", { className: "dsh-mod-header", children: [_jsxs("button", { type: "button", className: "dsh-mod-toggle", onClick: () => { setCollapsed(value => !value); }, "aria-expanded": !collapsed, children: [_jsx("span", { className: "dsh-mod-lead", children: _jsx(IconChecklistOutline14, {}) }), _jsxs("span", { className: "dsh-mod-count", children: [t('dock.title'), loading ? _jsx("span", { className: "dsh-mod-loading", children: "\u2026" }) : ` · ${unaccepted.length}`] }), acceptedFiles.length > 0 ? _jsxs("span", { className: "dsh-mod-accepted-chip", children: [t('dock.accepted'), " ", acceptedFiles.length] }) : null, _jsx("span", { className: "dsh-mod-chevron", children: collapsed ? _jsx(IconChevronUpOutline14, {}) : _jsx(IconChevronDownOutline14, {}) })] }), _jsxs("span", { className: "dsh-mod-header-actions", children: [_jsx(Tooltip, { label: t('dock.acceptAll'), side: "bottom", children: _jsx("button", { type: "button", className: "dsh-mod-action", onClick: () => { void runAcceptAll(); }, disabled: allBusy || unaccepted.length === 0, "aria-label": t('dock.acceptAll'), children: _jsx(IconCheckOutline14, {}) }) }), confirmingAll ? (_jsxs("span", { className: "dsh-mod-confirm", children: [_jsx("button", { type: "button", className: "dsh-mod-confirm-yes", onClick: () => { void runUndoAll(); }, disabled: allBusy, children: t('confirm') }), _jsx("button", { type: "button", className: "dsh-mod-confirm-no", onClick: () => { setConfirmingAll(false); }, children: t('cancel') })] })) : (_jsx(Tooltip, { label: t('dock.undoAll'), side: "bottom", children: _jsx("button", { type: "button", className: "dsh-mod-action", onClick: () => { setConfirmingAll(true); }, disabled: allBusy || unaccepted.length === 0, "aria-label": t('dock.undoAll'), children: allBusy ? _jsx("span", { className: "dsh-mod-spin", children: "\u25CC" }) : _jsx(IconUndoOutline14, {}) }) }))] })] }), collapsed ? null : (_jsxs("div", { className: "dsh-mod-body", children: [error !== null ? _jsxs("div", { className: "dsh-mod-note", children: [t('failed'), ": ", error] }) : null, actionError !== null ? _jsxs("div", { className: "dsh-mod-note", children: [t('failed'), ": ", actionError] }) : null, data?.baseline !== undefined ? (_jsxs("div", { className: "dsh-mod-baseline", children: [t('dock.baseline', { turn: data.baseline.turn }), data.baseline.degraded === true ? ` · ${t('degraded')}` : '', data.warnings.length > 0 ? _jsx("span", { className: "dsh-mod-warn", title: data.warnings.join(' · '), children: _jsx(IconWarningOutline16, {}) }) : null] })) : null, unaccepted.length === 0 && data !== null && data.modifications.length > 0 ? _jsx("div", { className: "dsh-mod-note", children: t('dock.modificationsOnly') }) : null, unaccepted.length === 0 && data !== null && data.modifications.length === 0 ? _jsx("div", { className: "dsh-mod-empty", children: t('dock.empty') }) : null, _jsx("ul", { className: "dsh-mod-list", children: unaccepted.map(change => (_jsx(FileRow, { change: change, busy: busy.has(`file:${change.path}`), confirmingKey: confirming, t: t, onOpenReview: () => { openReview(change.path); }, onOpenFile: () => { openFile(change); }, onAccept: () => { void runAcceptFile(change); }, onRequestUndo: () => { setConfirming(`file:${change.path}`); }, onConfirmUndo: () => { void runUndoFile(change); }, onCancelUndo: () => { setConfirming(null); } }, change.path))) }), acceptedFiles.length > 0 ? (_jsxs("button", { type: "button", className: "dsh-mod-accepted-toggle", onClick: () => { setShowAccepted(value => !value); }, children: [showAccepted ? t('dock.hideAccepted') : t('dock.showAccepted'), " (", acceptedFiles.length, ")"] })) : null, showAccepted ? (_jsx("ul", { className: "dsh-mod-list dsh-mod-list-accepted", children: acceptedFiles.map(change => (_jsx("li", { className: "dsh-mod-file dsh-mod-file-accepted", children: _jsxs("div", { className: "dsh-mod-file-row", children: [_jsx("button", { type: "button", className: "dsh-mod-file-path", onClick: () => { openFile(change); }, title: change.absolutePath, children: change.path }), _jsx("span", { className: "dsh-mod-status", children: t('dock.accepted') })] }) }, change.path))) })) : null, _jsx("div", { className: "dsh-mod-tools", children: _jsx(Tooltip, { label: t('dock.refresh'), side: "bottom", children: _jsx("button", { type: "button", className: "dsh-mod-tool", onClick: () => { void load(); }, "aria-label": t('dock.refresh'), children: _jsx(IconRefreshOutline14, {}) }) }) })] }))] }) }));
}
function FileRow(props) {
    const { change, busy, confirmingKey, t, onOpenReview, onOpenFile, onAccept, onRequestUndo, onConfirmUndo, onCancelUndo } = props;
    const fileConfirming = confirmingKey === `file:${change.path}`;
    const undoConfirm = (_jsxs("span", { className: "dsh-mod-confirm", children: [_jsx("button", { type: "button", className: "dsh-mod-confirm-yes", onClick: onConfirmUndo, disabled: busy, children: t('confirm') }), _jsx("button", { type: "button", className: "dsh-mod-confirm-no", onClick: onCancelUndo, children: t('cancel') })] }));
    return (_jsx("li", { className: "dsh-mod-file", children: _jsxs("div", { className: "dsh-mod-file-row", children: [_jsxs("button", { type: "button", className: "dsh-mod-file-path", onClick: onOpenReview, title: `${change.absolutePath} · ${t('openInEditor')}`, children: [_jsx("span", { className: `dsh-mod-status-dot dsh-mod-status-${change.status}` }), change.path] }), _jsx(Tooltip, { label: t('openAt'), side: "bottom", children: _jsx("button", { type: "button", className: "dsh-mod-link", onClick: onOpenFile, "aria-label": t('openAt'), children: _jsx(IconRightUpOutline16, { size: 8 }) }) }), _jsxs("span", { className: "dsh-mod-actions", children: [_jsx(Tooltip, { label: t('dock.accept'), side: "bottom", children: _jsx("button", { type: "button", className: "dsh-mod-action", onClick: onAccept, disabled: busy, "aria-label": t('dock.accept'), children: _jsx(IconCheckOutline14, {}) }) }), fileConfirming ? undoConfirm : (_jsx(Tooltip, { label: t('dock.undo'), side: "bottom", children: _jsx("button", { type: "button", className: "dsh-mod-action", onClick: onRequestUndo, disabled: busy, "aria-label": t('dock.undo'), children: busy ? _jsx("span", { className: "dsh-mod-spin", children: "\u25CC" }) : _jsx(IconUndoOutline14, {}) }) }))] })] }) }));
}
