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
export declare function levelsVisible(scope: LevelScope): readonly ToggleLevel[];
