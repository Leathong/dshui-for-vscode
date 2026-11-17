/**
 * The extension URI that focuses a workspace window.
 *
 * A turn-completion notification can be clicked while another window is
 * focused. The click arrives as a system-wide `vscode://` URI handled by this
 * extension (VS Code's own URI dispatch), and the handler forwards the folder to
 * the `code` CLI: its window manager focuses the window that already has that
 * folder open, and a CLI open does not trigger VS Code's "an external
 * application wants to open a local path" confirmation. Trust therefore narrows
 * to this extension (`extensions.confirmedUriHandlerExtensionIds`) instead of
 * relaxing `security.promptForLocalFileProtocolHandling` for every application.
 */
import * as path from 'node:path'

/** Path segment of the focus URI. */
export const FOCUS_URI_PATH = '/focus'

/**
 * Build the deeplink a notification click opens.
 * @param extensionId - this extension's id (`publisher.name`); lowercased because
 * VS Code keys URI handlers and trust entries by the lowercase id.
 * @param folder - absolute folder as the notifying window opened it.
 * @returns the `vscode://` URI.
 */
export function focusUri(extensionId: string, folder: string): string {
  return `vscode://${extensionId.toLowerCase()}${FOCUS_URI_PATH}?folder=${encodeURIComponent(path.resolve(folder))}`
}

/**
 * Read the folder out of a focus URI's query.
 * @param query - the URI query without the leading `?`.
 * @returns the absolute folder path, or undefined when absent or relative.
 */
export function folderFromFocusQuery(query: string): string | undefined {
  const folder = new URLSearchParams(query).get('folder')
  if (folder === null || folder === '') return undefined
  return path.isAbsolute(folder) ? folder : undefined
}
