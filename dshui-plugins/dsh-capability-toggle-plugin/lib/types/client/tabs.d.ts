import type { CapabilityRow, ToggleLevel } from '../shared/types.ts';
/**
 * The tab strip's identity set. Four capability families each get their own
 * tab (skills, mcps, tools, prompt gates); the two safety families — the
 * approval lock and the opt-in guard presets — are grouped under one trailing
 * "security" tab, since both are permission/safety controls rather than plain
 * capability switches. So a tab is no longer 1:1 with a `CapabilityKind`.
 */
export type TabId = 'skill' | 'mcp' | 'tool' | 'prompt' | 'security';
export type LevelScope = 'session' | 'session-project' | 'all';
/** Tab display order. */
export declare const TAB_ORDER: readonly TabId[];
/**
 * Which capability kinds each tab shows. Every tab but `security` maps to its
 * single like-named kind; `security` gathers the approval lock and the guard
 * presets. This is the one source of the tab→kind mapping — row filtering, the
 * per-tab counts, and the tab strip all read it, so they cannot drift.
 */
export declare const TAB_KINDS: Readonly<Record<TabId, readonly CapabilityRow['kind'][]>>;
export declare const LEVEL_SCOPES: readonly LevelScope[];
export declare function tabCounts(rows: readonly CapabilityRow[]): Record<TabId, {
    enabled: number;
    total: number;
}>;
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
export declare function bulkTargetIds(row: CapabilityRow): readonly string[];
export declare function levelsVisible(scope: LevelScope): readonly ToggleLevel[];
