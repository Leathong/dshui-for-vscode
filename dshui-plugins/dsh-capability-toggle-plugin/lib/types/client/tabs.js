import { LEVEL_PRIORITY } from '../shared/resolve.js';
/** Tab display order. */
export const TAB_ORDER = ['skill', 'mcp', 'tool', 'prompt', 'security'];
/**
 * Which capability kinds each tab shows. Every tab but `security` maps to its
 * single like-named kind; `security` gathers the approval lock and the guard
 * presets. This is the one source of the tab→kind mapping — row filtering, the
 * per-tab counts, and the tab strip all read it, so they cannot drift.
 */
export const TAB_KINDS = {
    skill: ['skill'],
    mcp: ['mcp'],
    tool: ['tool'],
    prompt: ['prompt'],
    security: ['approval', 'guard'],
};
export const LEVEL_SCOPES = ['session', 'session-project', 'all'];
export function tabCounts(rows) {
    const counts = Object.fromEntries(TAB_ORDER.map(id => [id, { enabled: 0, total: 0 }]));
    for (const row of rows) {
        for (const id of TAB_ORDER) {
            if (!TAB_KINDS[id].includes(row.kind))
                continue;
            const bucket = counts[id];
            if (row.kind === 'mcp') {
                // The MCP tab switches TOOLS, so it counts tools: with every MCP tool
                // disabled by default, "0/21" is the number a user needs — a per-server
                // count would read "0/4" while 21 tools sit switched off. A server row
                // with no members (a hand-built fixture, or a server whose tools have
                // not registered yet) still occupies one slot, so its badge never
                // vanishes while the row is on screen.
                const members = row.memberTools ?? [];
                if (members.length === 0) {
                    bucket.total += 1;
                    if (!row.disabled)
                        bucket.enabled += 1;
                }
                else {
                    bucket.total += members.length;
                    bucket.enabled += members.reduce((n, m) => n + (m.disabled ? 0 : 1), 0);
                }
                continue;
            }
            bucket.total += 1;
            const active = row.kind === 'guard' ? row.disabled : !row.disabled;
            if (active)
                bucket.enabled += 1;
        }
    }
    return counts;
}
/**
 * The switch ids one row contributes to a bulk action at one level. A plain row
 * addresses its own id. An MCP server row addresses its own id AND every member
 * id, because the group is only the members' DEFAULT: writing the group alone
 * would leave a member explicitly set at the SAME level untouched, so "disable
 * all" could visibly leave a tool enabled — the exact trap the toolbar promises
 * not to have. Writing both makes the outcome exactly "every tool shown in this
 * tab now has this stance at this level".
 * @param row - the row the toolbar is acting on.
 * @returns the switch ids to write.
 */
export function bulkTargetIds(row) {
    if (row.kind !== 'mcp')
        return [row.id];
    return [row.id, ...(row.memberTools ?? []).map(m => m.id)];
}
export function levelsVisible(scope) {
    return LEVEL_PRIORITY.slice(0, scope === 'session' ? 1 : scope === 'session-project' ? 2 : LEVEL_PRIORITY.length);
}
