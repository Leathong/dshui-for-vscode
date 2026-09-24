/**
 * Presentational components for the capability-toggle popup: the three-state
 * `LevelSwitch`, the two-line `Row`, the preferences drawer, and the tabbed
 * `Panel` body. All render from props alone; the drawer's persistence lives in
 * the control host (./index.tsx), which reads and writes the stored prefs and
 * hands the result down.
 *
 * @module dsh-capability-toggle-plugin/client/components
 */
import type { CapabilityToggleProjection, ToggleLevel, ToggleState } from '../shared/types.ts';
import type { Translate } from './types.ts';
import type { PanelPrefs } from './prefs.ts';
/** The popup body: tab strip, preferences drawer, and the active tab's row list. */
export declare function Panel(props: {
    readonly projection: CapabilityToggleProjection;
    readonly disabled: boolean;
    readonly t: Translate;
    readonly prefs: PanelPrefs;
    readonly onPrefsChange: (prefs: PanelPrefs) => void;
    readonly onSet: (level: ToggleLevel, id: string, next: ToggleState) => void;
    readonly onSetMany: (level: ToggleLevel, ids: readonly string[], next: ToggleState) => void;
}): JSX.Element;
/**
 * Shown regardless of whether the toggle panel is open — a blocked call must
 * surface its prompt even with the popup closed. The card is dismissed by the
 * Host's resolved broadcast (so every tab closes in sync), not by local state.
 */
export declare function ConfirmationCard(props: {
    readonly guardId: string;
    readonly guardAction: 'deny' | 'ask';
    readonly reason: string;
    readonly toolName: string;
    readonly detail: string;
    readonly busy: boolean;
    readonly failed?: boolean;
    readonly t: Translate;
    readonly onAnswer: (decision: 'allow' | 'deny') => void;
}): JSX.Element;
