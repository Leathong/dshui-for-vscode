/**
 * OS-level notifications for turn completion.
 *
 * VS Code's extension API only raises in-app toasts: the workbench keeps native
 * Notification Center / Action Center toasts for its own chat and task
 * features, and does not expose that channel to extensions. This module posts
 * through the platform's notification command instead, and `turnNotifier.ts`
 * falls back to an in-app toast when no system channel is available.
 *
 * macOS posts through the bundled `resources/dshui-notifier.app`. macOS
 * attributes a notification to the bundle that sent it and offers no
 * per-notification icon override, so only a dedicated helper can carry the dsh
 * icon; it also plays the system notification sound and stores the focus URI,
 * which its click opens (VS Code's URI handler then focuses the window that has
 * the folder open). Where the helper is missing, `osascript` still delivers
 * — attributed to Script Editor — so notifications never depend on it alone.
 */
import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import { promisify } from 'node:util'
import { logger } from './logger'

const execFileAsync = promisify(execFile)

/** How long one notification command may run before the delivery is abandoned. */
const TIMEOUT_MS = 5000

/**
 * The bundled macOS helper asks for notification permission on first use, and
 * that dialog waits for a human: allow enough time to answer it without ever
 * hanging a delivery forever.
 */
const HELPER_TIMEOUT_MS = 60_000

/** macOS notification sound: the system default, as configured per app. */
const MACOS_SOUND = 'default'

/** Title/body pair delivered to the OS notification center. */
export interface SystemNotification {
  readonly title: string
  readonly body: string
  /** `vscode://` extension URI a click should open; omit to only show the banner. */
  readonly focusUri?: string
}

/** Extension-owned assets the notification commands need. */
export interface NotificationAssets {
  /** Executable of the bundled macOS notifier app. */
  readonly macosNotifier: string
  /** Extension icon; notification servers that accept an icon path (Linux) show it. */
  readonly icon: string
}

/**
 * Strip the control characters the notification commands would choke on.
 * @param text - raw notification text.
 * @returns the text collapsed to printable single-line content.
 */
function sanitize(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
}

/** Exit status of one notification command, or undefined when it never started. */
type CommandExit = number | undefined

/**
 * Whether a bundled executable can be started at all.
 * @param file - absolute path.
 * @returns true when the file exists and is executable.
 */
function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Run one notification command.
 *
 * A command that exits non-zero (the user denied notifications, no GUI session)
 * still ran and delivered its verdict; a command that never started (missing
 * binary, permission denied, quarantine) is an installation problem the caller
 * may work around with another channel. The two are reported differently.
 * @param command - executable to run.
 * @param args - its arguments.
 * @param timeoutMs - how long it may run before it is abandoned.
 * @returns the exit status, or undefined when the command could not be started.
 */
async function run(command: string, args: readonly string[], timeoutMs = TIMEOUT_MS): Promise<CommandExit> {
  try {
    await execFileAsync(command, [...args], { timeout: timeoutMs, windowsHide: true })
    return 0
  } catch (error) {
    const failure = error as { code?: unknown; killed?: unknown; signal?: unknown }
    if (typeof failure.code === 'number' || failure.killed === true || failure.signal !== undefined) {
      logger.info(`[dshui] notification command ${command} failed: ${String(error)}`)
      return typeof failure.code === 'number' ? failure.code : -1
    }
    logger.warn(`[dshui] could not run notification command ${command}: ${String(error)}`)
    return undefined
  }
}

/**
 * Post one macOS notification.
 *
 * The bundled helper is the only channel that carries the dsh icon, plays the
 * notification sound and can be clicked to focus the workspace window. When it
 * exists but cannot post (the user turned notifications off, or there is no GUI
 * session) the delivery is over: posting as another app identity would bypass
 * that decision, so the caller shows its in-app toast instead.
 * @param notification - sanitized title and body.
 * @param assets - locations of the bundled helper and icon.
 * @returns true when a notification was posted.
 */
async function notifyMac(notification: SystemNotification, assets: NotificationAssets): Promise<boolean> {
  const title = sanitize(notification.title)
  const body = sanitize(notification.body)
  if (isExecutable(assets.macosNotifier)) {
    const args = ['--title', title, '--body', body, '--sound', MACOS_SOUND, '--group', 'dsh']
    if (notification.focusUri !== undefined) args.push('--open', notification.focusUri)
    const exit = await run(assets.macosNotifier, args, HELPER_TIMEOUT_MS)
    // A helper that ran and refused (exit 3: permission denied or no GUI
    // session) is the user's/OS's verdict; posting as another app identity
    // would bypass it, so the caller shows its in-app toast instead.
    return exit === 0
  }
  // The helper is bundled, so this is an incomplete/broken install rather than
  // a user decision: keep notifications working through osascript, attributed
  // to Script Editor and without the click action.
  logger.warn(`[dshui] bundled notifier unusable at ${assets.macosNotifier}; falling back to osascript`)
  const script = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv) sound name "Glass"\nend run'
  return (await run('osascript', ['-e', script, title, body])) === 0
}

/**
 * Post one Linux desktop notification through notify-send.
 * @param notification - sanitized title and body.
 * @param assets - locations of the bundled helper and icon.
 * @returns true when notify-send succeeded.
 */
async function notifyLinux(notification: SystemNotification, assets: NotificationAssets): Promise<boolean> {
  const args = ['--app-name', 'dsh', '--urgency', 'normal']
  if (fs.existsSync(assets.icon)) args.push('--icon', assets.icon)
  // Ask the desktop's sound theme for its standard notification sound; servers
  // that do not know the hint simply stay silent.
  args.push('--hint=string:sound-name:message-new-instant')
  args.push(sanitize(notification.title), sanitize(notification.body))
  return (await run('notify-send', args)) === 0
}

/**
 * Post one turn-completion notification to the OS notification center.
 * @param notification - title, body and click target to deliver.
 * @param assets - locations of the bundled helper and icon.
 * @returns true when the platform accepted the notification; false means the
 * caller should fall back to an in-app toast (Windows, denied permission, or a
 * missing/failed notification command).
 */
export async function sendSystemNotification(
  notification: SystemNotification,
  assets: NotificationAssets,
): Promise<boolean> {
  switch (process.platform) {
    case 'darwin':
      return notifyMac(notification, assets)
    case 'linux':
      return notifyLinux(notification, assets)
    default:
      return false
  }
}
