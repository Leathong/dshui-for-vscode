import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Undo icon (distinct from the circular refresh arrow used by the refresh
 * button). Same conventions as the `Icon*Outline14` family in
 * `@deepseek-ai/dsh-client-ui-primitives`: inline SVG, single color inherited
 * via `currentColor`, square viewBox scaled to `size`.
 *
 * The same 24×24 path is exposed in two crops:
 * - `IconUndoOutline14` renders the full glyph (viewBox 0 0 24 24) — right
 *   weight for the 14px sidebar dock buttons.
 * - `IconUndoOutline16` crops to the glyph core (viewBox 4 4 16 16) — the
 *   enlarged version used by the 16px message-action button.
 *
 * To swap in an icon found elsewhere, replace the `d` value below with the
 * target SVG's `<path d="...">` (keep `fill`-based single-color icons for
 * visual consistency; stroke-based icons need `stroke="currentColor"` +
 * `strokeWidth` instead).
 */
const UNDO_PATH = 'M7.53033 3.46967C7.82322 3.76256 7.82322 4.23744 7.53033 4.53033L5.81066 6.25H15C18.1756 6.25 20.75 8.82436 20.75 12C20.75 15.1756 18.1756 17.75 15 17.75H8.00001C7.58579 17.75 7.25001 17.4142 7.25001 17C7.25001 16.5858 7.58579 16.25 8.00001 16.25H15C17.3472 16.25 19.25 14.3472 19.25 12C19.25 9.65279 17.3472 7.75 15 7.75H5.81066L7.53033 9.46967C7.82322 9.76256 7.82322 10.2374 7.53033 10.5303C7.23744 10.8232 6.76256 10.8232 6.46967 10.5303L3.46967 7.53033C3.17678 7.23744 3.17678 6.76256 3.46967 6.46967L6.46967 3.46967C6.76256 3.17678 7.23744 3.17678 7.53033 3.46967Z';
function UndoIcon(props) {
    const { size, viewBox, className } = props;
    return (_jsx("svg", { width: size, height: size, className: className, viewBox: viewBox, fill: "none", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { d: UNDO_PATH, fill: "currentColor" }) }));
}
/** Full 24×24 glyph, rendered at 14px — sidebar dock undo buttons. */
export function IconUndoOutline14({ size = 14, className }) {
    return _jsx(UndoIcon, { size: size, viewBox: "0 0 24 24", className: className });
}
/** Cropped glyph core (viewBox 4 4 16 16), rendered at 16px — message rollback action button. */
export function IconUndoOutline16({ size = 16, className }) {
    return _jsx(UndoIcon, { size: size, viewBox: "4 4 16 16", className: className });
}
