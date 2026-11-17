/**
 * OS-level notifications for turn completion.
 *
 * VS Code's extension API only raises in-app toasts: the workbench keeps native
 * Notification Center / Action Center toasts for its own chat and task
 * features, and does not expose that channel to extensions. This module posts
 * through the platform's notification command instead, and `turnNotifier.ts`
 * falls back to an in-app toast when no system channel is available.
 *
 * macOS notifications default to AppleScript (`osascript` Standard Additions),
 * which the OS attributes to Script Editor — the AppleScript host — and which
 * cannot activate an app on click. When `terminal-notifier` is installed it is
 * used instead: the banner is attributed to terminal-notifier (v3 no longer
 * allows overriding the sender identity or icon), but a click opens this
 * extension's `vscode://` focus URI, which the extension's URI handler turns
 * into a window focus — and `-group` keeps successive turn notifications to one
 * entry.
 */
import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import { promisify } from 'node:util'
import { logger } from './logger'

const execFileAsync = promisify(execFile)

/** How long one notification command may run before the delivery is abandoned. */
const TIMEOUT_MS = 5000

/** Absolute paths of `terminal-notifier` worth probing on macOS. */
const TERMINAL_NOTIFIER_CANDIDATES = [
  '/opt/homebrew/bin/terminal-notifier',
  '/usr/local/bin/terminal-notifier',
]

/** Title/body pair delivered to the OS notification center. */
export interface SystemNotification {
  readonly title: string
  readonly body: string
  /** `vscode://` extension URI a click should open; omit to only activate VS Code. */
  readonly focusUri?: string
}

/**
 * Strip the control characters the notification commands would choke on.
 * @param text - raw notification text.
 * @returns the text collapsed to printable single-line content.
 */
function sanitize(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
}

/**
 * Run one notification command.
 * @param command - executable to run.
 * @param args - its arguments.
 * @returns true when the command exited successfully.
 */
async function run(command: string, args: readonly string[]): Promise<boolean> {
  try {
    await execFileAsync(command, [...args], { timeout: TIMEOUT_MS, windowsHide: true })
    return true
  } catch (error) {
    logger.info(`[dshui] system notification via ${command} failed: ${String(error)}`)
    return false
  }
}

/**
 * Post one macOS notification.
 * @param notification - sanitized title and body.
 * @returns true when a notification command succeeded.
 */
async function notifyMac(notification: SystemNotification): Promise<boolean> {
  const title = sanitize(notification.title)
  const body = sanitize(notification.body)
  // terminal-notifier is its own app bundle, so the banner is attributed to it
  // (v3 removed `-sender`/`-appIcon`: UserNotifications always uses the sending
  // bundle's signed identity). The click action is `-open` with this extension's
  // focus URI, which VS Code hands to the extension's URI handler; `-execute` is
  // not usable here because terminal-notifier exits right after posting and the
  // command never runs on click. `-group` keeps successive turn notifications to
  // one entry. Plain AppleScript posts as "Script Editor" and cannot act on a
  // click at all.
  const terminalNotifier = TERMINAL_NOTIFIER_CANDIDATES.find((candidate) => fs.existsSync(candidate))
  if (terminalNotifier !== undefined) {
    const args = ['-title', title, '-message', body, '-group', 'dsh']
    if (notification.focusUri !== undefined) {
      args.push('-open', notification.focusUri)
    } else {
      args.push('-activate', 'com.microsoft.VSCode')
    }
    if (await run(terminalNotifier, args)) return true
  }
  const script = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run'
  return run('osascript', ['-e', script, title, body])
}

/**
 * Post one Linux desktop notification through notify-send.
 * @param notification - sanitized title and body.
 * @returns true when notify-send succeeded.
 */
async function notifyLinux(notification: SystemNotification): Promise<boolean> {
  return run('notify-send', [
    '--app-name', 'dsh',
    '--urgency', 'normal',
    sanitize(notification.title),
    sanitize(notification.body),
  ])
}

/**
 * Post one completion notification to the OS notification center.
 * @param notification - title and body to deliver.
 * @returns true when the platform accepted the notification; false means the
 * caller should fall back to an in-app toast (Windows, or a missing/failed
 * notification command).
 */
export async function sendSystemNotification(notification: SystemNotification): Promise<boolean> {
  switch (process.platform) {
    case 'darwin':
      return notifyMac(notification)
    case 'linux':
      return notifyLinux(notification)
    default:
      return false
  }
}
