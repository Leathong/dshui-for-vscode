import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Presentational components for the capability-toggle popup: the three-state
 * `LevelSwitch`, the two-line `Row`, the preferences drawer, and the tabbed
 * `Panel` body. All render from props alone; the drawer's persistence lives in
 * the control host (./index.tsx), which reads and writes the stored prefs and
 * hands the result down.
 *
 * @module dsh-capability-toggle-plugin/client/components
 */
import { useEffect, useRef, useState } from 'react';
import { LEVEL_SCOPES, TAB_KINDS, TAB_ORDER, bulkTargetIds, levelsVisible, tabCounts } from './tabs.js';
/**
 * The glyph for one segment state. Tiny inline SVGs (no icon-font dependency),
 * sized in `em` so they scale with the button's font-size and inherit its
 * color via `currentColor`. `on` is a check, `off` an ✕, `inherit` a dash —
 * a legible at-a-glance triad. The segments are icon-only, so the stance meaning
 * lives in each segment's hover tooltip and its accessible name; the glyph itself
 * is decorative and aria-hidden.
 */
function StateGlyph(props) {
    const common = {
        width: '1em', height: '1em', viewBox: '0 0 16 16',
        fill: 'none', stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
    };
    if (props.kind === 'on')
        return _jsx("svg", { ...common, children: _jsx("path", { d: "M3.5 8.5l3 3 6-7" }) });
    if (props.kind === 'off')
        return _jsx("svg", { ...common, children: _jsx("path", { d: "M4 4l8 8M12 4l-8 8" }) });
    return _jsx("svg", { ...common, children: _jsx("path", { d: "M4 8h8" }) });
}
/**
 * The switch for one level of one capability row: a SINGLE icon button showing
 * ONLY the current stance (not all three at once — the earlier three-segment
 * control turned every row into a wall of identical grey boxes). It is a
 * two-state toggle: clicking flips enabled ↔ disabled, so the common "turn this
 * off here" is one click. The third stance, "unset" (inherit from the next
 * level), is the DEFAULT and is reached by the small clear badge that appears
 * only once a level has been explicitly set — click it to revert to inherit.
 * An unset button shows a faint dash and, on click, goes to "off" (the usual
 * intent when acting on a default-enabled capability is to disable it here).
 *
 * The button colours by stance (on=brand blue / off=red / unset=neutral) so a row
 * reads as one coloured dot per level. `disabled` reflects either a running
 * agent (whole panel) or a level that cannot be set here (e.g. project with no
 * root). Full keyboard/AT reach: the accessible name states the level and
 * current stance; the clear badge has its own label.
 */
function LevelSwitch(props) {
    const { level, value, disabled, t, onPick, label } = props;
    // Main-button click flips the enabled sense; an unset level goes to "off"
    // (acting on a default-on capability usually means disabling it here).
    const toggled = value === 'on' ? 'off' : 'on';
    const isSet = value !== 'inherit';
    const levelName = t(`level.${level}`);
    const describe = (state) => `${label === undefined ? '' : `${label} · `}${levelName} · ${state}`;
    return (_jsxs("div", { className: "dshct-lvsw", children: [_jsx("button", { type: "button", className: "dshct-lvsw-main", "data-kind": value, disabled: disabled, "aria-label": describe(t(`state.${value}`)), title: describe(t(`state.${value}`)), onClick: () => onPick(toggled), children: _jsx(StateGlyph, { kind: value }) }), isSet
                ? (_jsx("button", { type: "button", className: "dshct-lvsw-clear", disabled: disabled, "aria-label": describe(t('state.clear')), title: t('state.clear'), onClick: () => onPick('inherit'), children: _jsx("svg", { width: "1em", height: "1em", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: _jsx("path", { d: "M4.5 4.5l7 7M11.5 4.5l-7 7", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }) }) }))
                : null] }));
}
/**
 * The bulk-action dropdown for one level column in the search toolbar: a
 * single 28×28 trigger that opens a three-item menu (enable all / disable all
 * / clear all), reusing the same ✓/✕/– glyph language as {@link LevelSwitch}'s
 * stances so a column reads as one control whether it is acting on a single
 * row or on every currently visible one. One 28×28 target replaces the old
 * 9-button grid whose 15×20 members fell below the WCAG 2.5.8 target-size
 * floor; the actions move into a menu whose 32px rows are comfortably
 * reachable. `open`/`onOpenChange` are owned by the Panel so at most one
 * menu is ever expanded (opening B closes A). `disabled` covers the
 * running-agent lock, a project column with no project root, AND an empty
 * visible set (nothing to act on) — the caller folds all three into one flag
 * since the button has no other state to show.
 */
function BulkActions(props) {
    const { level, open, onOpenChange, disabled, t, onPick } = props;
    const rootRef = useRef(null);
    const levelName = t(`level.${level}`);
    const actions = ['on', 'off', 'inherit'];
    useEffect(() => {
        if (!open)
            return;
        const onDocPointerDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target))
                onOpenChange(false);
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                // The Panel's own outside-close also listens for Escape on document;
                // swallowing here (capture runs first) keeps one press closing only
                // the menu, not the whole panel underneath it.
                e.stopPropagation();
                onOpenChange(false);
            }
        };
        document.addEventListener('pointerdown', onDocPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('pointerdown', onDocPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [open, onOpenChange]);
    return (_jsxs("div", { className: "dshct-bulk", ref: rootRef, children: [_jsx("button", { type: "button", className: "dshct-bulk-btn", "data-open": open, disabled: disabled, "aria-haspopup": "menu", "aria-expanded": open, "aria-label": `${levelName} · ${t('bulk.menu')}`, title: `${levelName} · ${t('bulk.menu')}`, onClick: () => onOpenChange(!open), children: _jsx("svg", { width: "1em", height: "1em", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: _jsx("path", { d: "M4.5 6.25 8 9.75l3.5-3.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }) }), open
                ? (_jsx("div", { className: "dshct-bulk-menu", role: "menu", "aria-label": `${levelName} · ${t('bulk.menu')}`, children: actions.map(state => (_jsxs("button", { type: "button", role: "menuitem", className: "dshct-bulk-item", "data-kind": state, onClick: () => { onOpenChange(false); onPick(state); }, children: [_jsx(StateGlyph, { kind: state }), _jsx("span", { children: t(`bulk.${state}`) })] }, state))) }))
                : null] }));
}
/**
 * One capability row, laid out as two lines against the shared column grid:
 * line 1 is the name (with a status dot) plus the three level segments and the
 * result badge, each aligned under its column header; line 2 is the full-width
 * description, truncated to one line and revealed in full on hover.
 *
 * An `mcp` row is expandable: its name becomes a disclosure button that reveals
 * the server's member tools below the description. Each member is a switchable
 * sub-row of its own (name, its own level switches, its own result badge), since
 * every MCP tool is switched separately and DEFAULTS TO DISABLED. The server row
 * keeps a switch too, and it is the members' DEFAULT: setting the server ON here
 * enables every member that is not explicitly set OFF at the same or a nearer
 * level, so one click turns a whole server on. The description line reports how
 * many of the server's tools are actually callable.
 *
 * `projectDisabled` greys the project segment when the session has no project
 * root to write under; the whole row's controls are also disabled while busy.
 */
/**
 * Resolve one row's displayed name and description. Prompt rows carry an i18n
 * key suffix in `name` and the registry name in `description`; the approval
 * singleton uses fixed i18n strings; the guard family looks up its name/desc
 * by row name; every other kind carries its own display strings verbatim.
 * Shared by {@link Row} (rendering) and {@link Panel} (search filtering), so
 * a search matches what the user actually reads on screen, not a raw id the
 * UI never shows for these three kinds.
 */
function rowDisplayText(row, t) {
    if (row.kind === 'prompt')
        return { name: t(`prompt.${row.name}.name`), desc: t(`prompt.${row.name}.desc`) };
    if (row.kind === 'approval')
        return { name: t('approval.name'), desc: t('approval.desc') };
    if (row.kind === 'guard')
        return { name: t(`guard.${row.name}.name`), desc: t(`guard.${row.name}.desc`) };
    return { name: row.name, desc: row.description };
}
function Row(props) {
    const { row, disabled, projectDisabled, visibleLevels, showUsage, t } = props;
    const [expanded, setExpanded] = useState(false);
    const { name: displayName, desc: displayDesc } = rowDisplayText(row, t);
    const members = row.memberTools ?? [];
    const expandable = row.kind === 'mcp' && members.length > 0;
    // How many of this server's tools are callable right now: the one number a
    // user needs at a glance once every MCP tool starts disabled.
    const enabledMembers = members.reduce((n, m) => n + (m.disabled ? 0 : 1), 0);
    // A guard row reuses `disabled` to mean ACTIVE (opt-in default off). Its
    // status dot lights when active (protection on) — the opposite of the
    // default-on families, where the dot lights when the capability is available
    // and greys when off. So `dotOff` is inverted for guards.
    const isGuard = row.kind === 'guard';
    const guardActive = isGuard && row.disabled;
    const dotOff = isGuard ? !guardActive : row.disabled;
    // Row dimming reads "not the effective/attention state": a default-on family
    // dims when disabled; a guard (default off) dims when INACTIVE, so an active
    // guard row stays full-strength like an enabled capability. `disabled` is the
    // raw wire flag, so invert it for guards here just as `dotOff` does.
    const rowDim = isGuard ? !guardActive : row.disabled;
    return (_jsxs("div", { className: "dshct-row", "data-disabled": rowDim, children: [_jsxs("div", { className: "dshct-row-top", children: [expandable
                        ? (_jsxs("button", { type: "button", className: "dshct-row-name dshct-row-name-btn", "aria-expanded": expanded, title: t('mcp.expand', { count: members.length }), onClick: () => setExpanded(v => !v), children: [_jsx("span", { className: "dshct-caret", "data-open": expanded, "aria-hidden": "true", children: "\u25B8" }), _jsx("span", { className: "dshct-dot", "data-off": dotOff, "aria-hidden": "true" }), _jsx("span", { className: "dshct-row-text", children: displayName }), showUsage && row.callCount !== undefined && row.callCount > 0
                                    ? (_jsx("span", { className: "dshct-usage", title: t('usage.calls.title', { count: row.callCount }), children: t('usage.calls', { count: row.callCount }) }))
                                    : null] }))
                        : (_jsxs("div", { className: "dshct-row-name", children: [_jsx("span", { className: "dshct-dot", "data-off": dotOff, "aria-hidden": "true" }), _jsx("span", { className: "dshct-row-text", title: displayName, children: displayName }), showUsage && row.callCount !== undefined && row.callCount > 0
                                    ? (_jsx("span", { className: "dshct-usage", title: t('usage.calls.title', { count: row.callCount }), children: t('usage.calls', { count: row.callCount }) }))
                                    : null] })), visibleLevels.map(level => (_jsx(LevelSwitch, { level: level, value: row.levels[level], disabled: disabled || (level === 'project' && projectDisabled), t: t, onPick: next => props.onSet(level, row.id, next) }, level))), isGuard
                        ? (_jsx("span", { className: "dshct-badge dshct-badge-guard", "data-off": !guardActive, "data-action": row.guardAction, title: guardActive
                                ? (row.hitCount && row.hitCount > 0
                                    ? t('guard.hits.title', { count: row.hitCount })
                                    : t('guard.badge.active.title', { action: t(`guard.action.${row.guardAction}`) }))
                                : t('guard.badge.inactive.title'), children: guardActive
                                ? (row.hitCount && row.hitCount > 0
                                    ? t('guard.hits', { count: row.hitCount })
                                    : t('guard.badge.active'))
                                : t('guard.badge.inactive') }))
                        : (_jsx("span", { className: "dshct-badge", "data-off": row.disabled, title: row.disabled ? t('badge.off.title') : t('badge.on.title'), children: row.disabled ? t('badge.off') : t('badge.on') }))] }), expandable
                ? (_jsxs("button", { type: "button", className: "dshct-row-desc dshct-row-desc-btn", "data-open": expanded, "aria-expanded": expanded, title: t('mcp.expand', { count: members.length }), onClick: () => setExpanded(v => !v), children: [displayDesc, ' · ', t('mcp.count', { enabled: enabledMembers, total: members.length })] }))
                : _jsx("div", { className: "dshct-row-desc", title: displayDesc, children: displayDesc }), expandable && expanded
                ? (_jsxs("div", { className: "dshct-members-wrap", children: [_jsx("div", { className: "dshct-members-hint", children: t('mcp.members.hint') }), _jsx("ul", { className: "dshct-members", children: members.map(m => (_jsxs("li", { className: "dshct-member", "data-disabled": m.disabled, children: [_jsxs("div", { className: "dshct-member-top", children: [_jsxs("div", { className: "dshct-member-name", children: [_jsx("span", { className: "dshct-row-text", title: m.name, children: m.name }), showUsage && m.callCount !== undefined && m.callCount > 0
                                                        ? (_jsx("span", { className: "dshct-usage", title: t('usage.calls.title', { count: m.callCount }), children: t('usage.calls', { count: m.callCount }) }))
                                                        : null] }), visibleLevels.map(level => (_jsx(LevelSwitch, { level: level, value: m.levels[level], label: m.name, disabled: disabled || (level === 'project' && projectDisabled), t: t, onPick: next => props.onSet(level, m.id, next) }, level))), _jsx("span", { className: "dshct-badge", "data-off": m.disabled, title: m.disabled ? t('badge.off.title') : t('badge.on.title'), children: m.disabled ? t('badge.off') : t('badge.on') })] }), m.description !== ''
                                        ? _jsx("div", { className: "dshct-member-desc", title: m.description, children: m.description })
                                        : null] }, m.id))) })] }))
                : null] }));
}
/**
 * A filtered row's plain-text haystack for the search box: the resolved
 * display name and description, lower-cased once per row per render. Search
 * matches against what the user actually SEES (translated strings), not the
 * wire `id`/`name`, so typing a guard's shown label finds it even though its
 * `row.name` is the untranslated preset key. An MCP server row also indexes its
 * member tools, so searching a tool name (`mcp__dart__launch_app` or part of its
 * summary) surfaces the server that owns it instead of hiding it behind a
 * collapsed disclosure.
 */
function rowHaystack(row, t) {
    const { name, desc } = rowDisplayText(row, t);
    const members = (row.memberTools ?? []).map(m => `${m.name} ${m.description}`).join(' ');
    return `${name} ${desc} ${members}`.toLowerCase();
}
/** The popup body: tab strip, preferences drawer, and the active tab's row list. */
export function Panel(props) {
    const { projection, disabled, t, prefs } = props;
    const [tab, setTab] = useState('skill');
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [prefsOpen, setPrefsOpen] = useState(false);
    // Which level's bulk dropdown is expanded — one shared slot so opening a
    // second menu collapses the first (null = all closed). Closing on tab or
    // search toggle keeps a stale menu from floating over another tab's rows.
    const [bulkMenu, setBulkMenu] = useState(null);
    // Rows for the active tab: every kind that tab gathers (one kind for the four
    // capability tabs, two for `security`), in the row order the projection gives.
    const activeKinds = TAB_KINDS[tab];
    const tabRows = projection.rows.filter(r => activeKinds.includes(r.kind));
    // The search box narrows the active tab's rows further, by display text; a
    // blank (or closed) search box is a no-op filter, so `rows` degrades to
    // exactly the prior per-tab list when search is untouched.
    const needle = query.trim().toLowerCase();
    const rows = needle === '' ? tabRows : tabRows.filter(r => rowHaystack(r, t).includes(needle));
    const counts = tabCounts(projection.rows);
    // Only default-on families count as "off" here: a guard reuses `disabled` to
    // mean ACTIVE, so counting it would report turning a safety preset ON as a
    // capability being disabled (and light the composer's red count dot). Exclude
    // guards from this default-on tally.
    const offCount = projection.rows.filter(r => r.kind !== 'guard' && r.disabled).length;
    const projectDisabled = projection.projectKey === '';
    // Bulk-action target ids: every row CURRENTLY VISIBLE (active tab + search
    // filter), not the whole inventory and not a manual selection — matching the
    // "search narrows, bulk acts on what's shown" contract the toolbar promises.
    // An MCP row contributes its member ids too, so a bulk action reaches exactly
    // the tools the tab now counts (see bulkTargetIds).
    const visibleIds = rows.flatMap(bulkTargetIds);
    const visibleLevels = levelsVisible(prefs.levels);
    return (_jsxs("div", { className: "dshct-panel", role: "dialog", "aria-label": t('panel.title'), style: { '--dshct-lv-n': visibleLevels.length }, children: [_jsxs("div", { className: "dshct-header", children: [_jsx("span", { className: "dshct-title", children: t('panel.title') }), _jsxs("span", { className: "dshct-header-actions", children: [offCount > 0
                                ? _jsx("span", { className: "dshct-header-sub", "data-has": true, children: t('header.off', { count: offCount }) })
                                : null, _jsx("button", { type: "button", className: "dshct-pref-toggle", "data-open": prefsOpen, "aria-expanded": prefsOpen, "aria-label": t('prefs.toggle'), title: t('prefs.toggle'), onClick: () => { setBulkMenu(null); setPrefsOpen(v => !v); }, children: _jsx("svg", { className: "dshct-pref-caret", width: "12", height: "12", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: _jsx("path", { d: "M4.5 6.25 8 9.75l3.5-3.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }) })] })] }), prefsOpen
                ? (_jsxs("div", { className: "dshct-prefs", children: [_jsxs("div", { className: "dshct-pref-row", children: [_jsxs("span", { className: "dshct-pref-text", children: [_jsx("span", { className: "dshct-pref-label", id: "dshct-pref-fraction", children: t('prefs.fraction') }), _jsx("span", { className: "dshct-pref-hint", children: t('prefs.fraction.hint') })] }), _jsx("button", { type: "button", role: "switch", className: "dshct-switch", "aria-checked": prefs.showFraction, "aria-labelledby": "dshct-pref-fraction", onClick: () => props.onPrefsChange({ ...prefs, showFraction: !prefs.showFraction }) })] }), _jsxs("div", { className: "dshct-pref-row", children: [_jsxs("span", { className: "dshct-pref-text", children: [_jsx("span", { className: "dshct-pref-label", id: "dshct-pref-usage", children: t('prefs.usage') }), _jsx("span", { className: "dshct-pref-hint", children: t('prefs.usage.hint') })] }), _jsx("button", { type: "button", role: "switch", className: "dshct-switch", "aria-checked": prefs.showUsage, "aria-labelledby": "dshct-pref-usage", onClick: () => props.onPrefsChange({ ...prefs, showUsage: !prefs.showUsage }) })] }), _jsxs("div", { className: "dshct-pref-row", children: [_jsxs("span", { className: "dshct-pref-text", children: [_jsx("span", { className: "dshct-pref-label", id: "dshct-pref-levels", children: t('prefs.levels') }), _jsx("span", { className: "dshct-pref-hint", children: t('prefs.levels.hint') })] }), _jsx("select", { className: "dshct-pref-select", value: prefs.levels, "aria-labelledby": "dshct-pref-levels", onChange: e => props.onPrefsChange({ ...prefs, levels: e.target.value }), children: LEVEL_SCOPES.map(scope => (_jsx("option", { value: scope, children: t(`prefs.levels.${scope}`) }, scope))) })] })] }))
                : null, _jsx("div", { className: "dshct-tabs", role: "tablist", children: TAB_ORDER.map(id => (_jsxs("button", { type: "button", role: "tab", className: "dshct-tab", "data-active": tab === id, "aria-selected": tab === id, onClick: () => { setBulkMenu(null); setTab(id); }, children: [t(`tab.${id}`), _jsx("span", { className: "dshct-tab-count", "data-fraction": prefs.showFraction, title: t('tab.count.title', { enabled: counts[id].enabled, total: counts[id].total }), children: prefs.showFraction ? `${counts[id].enabled}/${counts[id].total}` : counts[id].total })] }, id))) }), _jsxs("div", { className: "dshct-note", children: [t('note.priority.lead'), _jsx("b", { children: t('note.priority.chain') }), t('note.priority.tail')] }), disabled ? _jsx("div", { className: "dshct-note dshct-running", role: "status", children: t('note.running') }) : null, _jsxs("div", { className: "dshct-colhead", children: [_jsxs("span", { className: "dshct-col-cap", children: [_jsx("button", { type: "button", className: "dshct-search-toggle", "data-open": searchOpen, "aria-expanded": searchOpen, "aria-label": t('search.toggle'), title: t('search.toggle'), onClick: () => { setBulkMenu(null); setSearchOpen(v => !v); }, children: _jsxs("svg", { width: "1em", height: "1em", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [_jsx("circle", { cx: "7", cy: "7", r: "4.5", stroke: "currentColor", strokeWidth: "1.4" }), _jsx("path", { d: "M10.6 10.6L14 14", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" })] }) }), _jsx("span", { "aria-hidden": "true", children: t('col.capability') })] }), visibleLevels.map(level => (_jsx("span", { className: "dshct-col-lv", "aria-hidden": "true", children: t(`level.${level}`) }, level))), _jsx("span", { className: "dshct-col-badge", "aria-hidden": "true", children: t('col.result') })] }), searchOpen
                ? (_jsxs("div", { className: "dshct-toolbar", children: [_jsx("input", { type: "search", className: "dshct-search-input", value: query, placeholder: t('search.placeholder'), "aria-label": t('search.placeholder'), onChange: e => setQuery(e.target.value) }), visibleLevels.map(level => (_jsx(BulkActions, { level: level, open: bulkMenu === level, onOpenChange: open => setBulkMenu(open ? level : null), disabled: disabled || (level === 'project' && projectDisabled) || visibleIds.length === 0, t: t, onPick: next => props.onSetMany(level, visibleIds, next) }, level))), _jsx("span", { "aria-hidden": "true" })] }))
                : null, _jsx("div", { className: "dshct-list", onScroll: bulkMenu !== null ? () => setBulkMenu(null) : undefined, children: rows.length === 0
                    ? _jsx("div", { className: "dshct-empty", children: t(needle === '' ? 'empty' : 'search.empty') })
                    : rows.map(row => (_jsx(Row, { row: row, disabled: disabled, projectDisabled: projectDisabled, visibleLevels: visibleLevels, showUsage: prefs.showUsage, t: t, onSet: props.onSet }, row.id))) }), projectDisabled
                ? _jsx("div", { className: "dshct-foot", children: t('foot.noProject') })
                : _jsx("div", { className: "dshct-foot", title: projection.projectKey, children: t('foot.project') })] }));
}
/**
 * Shown regardless of whether the toggle panel is open — a blocked call must
 * surface its prompt even with the popup closed. The card is dismissed by the
 * Host's resolved broadcast (so every tab closes in sync), not by local state.
 */
export function ConfirmationCard(props) {
    const guardName = props.guardId.startsWith('guard:') ? props.guardId.slice(6) : props.guardId;
    return (_jsxs("div", { className: "dshct-confirm", role: "alertdialog", "aria-modal": "false", "aria-label": props.t('guard.confirm.title'), "data-action": props.guardAction, children: [_jsxs("div", { className: "dshct-confirm-head", children: [_jsx("span", { className: "dshct-confirm-badge", "data-action": props.guardAction, children: props.guardAction === 'deny'
                            ? props.t('guard.action.deny')
                            : props.t('guard.action.ask') }), _jsx("span", { className: "dshct-confirm-title", children: props.t('guard.confirm.title') })] }), _jsx("div", { className: "dshct-confirm-body", children: props.t('guard.confirm.body', { guard: guardName, tool: props.toolName }) }), _jsxs("div", { className: "dshct-confirm-section", children: [_jsx("div", { className: "dshct-confirm-label", children: props.t('guard.confirm.reason') }), _jsx("div", { className: "dshct-confirm-reason", children: props.reason })] }), _jsxs("div", { className: "dshct-confirm-section", children: [_jsx("div", { className: "dshct-confirm-label", children: props.t('guard.confirm.detail') }), _jsx("pre", { className: "dshct-confirm-detail", tabIndex: 0, "aria-label": props.t('guard.confirm.detail'), children: props.detail })] }), props.busy
                ? _jsx("div", { className: "dshct-confirm-waiting", children: props.t('guard.confirm.waiting') })
                : null, props.failed
                ? _jsx("div", { className: "dshct-confirm-error", role: "alert", children: props.t('guard.confirm.retry') })
                : null, _jsxs("div", { className: "dshct-confirm-actions", children: [_jsx("button", { type: "button", className: "dshct-confirm-btn", "data-kind": "deny", disabled: props.busy, onClick: () => props.onAnswer('deny'), children: props.t('guard.confirm.deny') }), _jsx("button", { type: "button", className: "dshct-confirm-btn", "data-kind": "allow", disabled: props.busy, onClick: () => props.onAnswer('allow'), children: props.t('guard.confirm.allow') })] })] }));
}
