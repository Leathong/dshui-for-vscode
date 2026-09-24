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
            bucket.total += 1;
            const active = row.kind === 'guard' ? row.disabled : !row.disabled;
            if (active)
                bucket.enabled += 1;
        }
    }
    return counts;
}
export function levelsVisible(scope) {
    return LEVEL_PRIORITY.slice(0, scope === 'session' ? 1 : scope === 'session-project' ? 2 : LEVEL_PRIORITY.length);
}
