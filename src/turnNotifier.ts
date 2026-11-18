/**
 * Turn-completion notifications for the embedded dsh UI.
 *
 * The extension host cannot observe dsh's in-process `session/event` stream and
 * the page inside the webview cannot raise VS Code notifications, so the dsh
 * host plugin (`dshui-plugins/dshui-host-turn-notify`) publishes turn
 * boundaries into a per-server file in the dsh home and this notifier polls it
 * (the same cross-process channel the shared-backend lease uses).
 *
 * The feed is consumed on every tick — also while the window is focused — so a
 * turn that ends while the user is looking is never replayed later as a stale
 * notification. Only this window's workspace is reported: windows share one dsh
 * server under the shared backend, but each owns its own folder.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { focusUri } from './focusUri'
import { logger } from './logger'
import { sendSystemNotification, type NotificationAssets } from './systemNotifier'
import {
  advanceTurnEventCursor,
  parseTurnEventFeed,
  sameWorkspacePath,
  turnEventMaxSeq,
  turnEventOutcome,
  turnEventsFilePath,
  type TurnEventCursor,
  type TurnEventFeed,
  type TurnEventOutcome,
} from './turnEvents'

/** Settings key under `dshui`; also the contributed `enum` values in package.json. */
const CONFIG_KEY = 'notifyOnTurnComplete'

/** Poll cadence; the feed only changes when a turn ends. */
const POLL_MS = 1500

/** When this window raises turn-completion notifications. */
export type TurnNotifyMode = 'off' | 'unfocused' | 'always'

const isZh = vscode.env.language.toLowerCase().startsWith('zh')

/**
 * Pick the localized notification text.
 * @param en - English text.
 * @param zh - Chinese text.
 * @returns the text for the current VS Code language.
 */
function L(en: string, zh: string): string {
  return isZh ? zh : en
}

/** Host-side dependencies the notifier reads on every tick. */
export interface TurnNotifierOptions {
  /** The dsh home whose feed files are polled. */
  readonly dshHome: string
  /** This window's workspace root; undefined while no folder is open. */
  readonly workspacePath: () => string | undefined
  /** Port of the dsh server currently bound to this window's workspace, if any. */
  readonly serverPort: () => number | undefined
  /** The folder exactly as this window opened it (for the click-to-focus deeplink). */
  readonly workspaceFolder?: () => string | undefined
  /** This extension's id; the click deeplink authority and its trust entry. */
  readonly extensionId: string
  /** Notification commands plus the assets (notifier helper, icon) they need. */
  readonly assets: NotificationAssets
}

/**
 * Polls the dsh host plugin's feed and raises a VS Code notification for each
 * turn this window's workspace completes or fails.
 */
export class TurnNotifier implements vscode.Disposable {
  private readonly options: TurnNotifierOptions
  private timer: NodeJS.Timeout | null = null
  private cursor: TurnEventCursor | undefined
  /** Port the current baseline belongs to; a new server (port) re-seeds it. */
  private baselinePort: number | undefined
  /** `size:mtime` of the last consumed feed, so an unchanged file is not re-read. */
  private stamp = ''

  /**
   * @param options - feed location plus the workspace and server readers.
   */
  constructor(options: TurnNotifierOptions) {
    this.options = options
    this.timer = setInterval(() => { this.poll() }, POLL_MS)
    this.timer.unref()
  }

  /** Stop polling and release the timer. */
  dispose(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** The configured notification policy; unknown values fall back to `unfocused`. */
  private mode(): TurnNotifyMode {
    const configured = vscode.workspace.getConfiguration('dshui').get<string>(CONFIG_KEY)
    return configured === 'off' || configured === 'always' ? configured : 'unfocused'
  }

  /** Consume the feed once and notify for this window's fresh boundaries. */
  private poll(): void {
    if (this.timer === null) return
    const port = this.options.serverPort()
    const workspacePath = this.options.workspacePath()
    if (port === undefined || workspacePath === undefined) return
    const file = turnEventsFilePath(this.options.dshHome, port)
    // A baseline per server: whatever the feed already holds when this window
    // first learns the port is history, while the feed of a server this window
    // watched from (no feed yet) is its own and must notify.
    if (port !== this.baselinePort) this.seedBaseline(port, file)
    let stat: fs.Stats
    try {
      stat = fs.statSync(file)
    } catch {
      // No turn has completed on this server yet (or the file is being replaced).
      return
    }
    const stamp = `${String(stat.size)}:${String(stat.mtimeMs)}`
    if (stamp === this.stamp) return
    this.stamp = stamp
    // The stat above was only the change detector; re-validate the payload.
    const feed = this.readFeed(file)
    if (feed === undefined) return
    const batch = advanceTurnEventCursor(feed, this.cursor)
    this.cursor = batch.cursor
    const mode = this.mode()
    if (mode === 'off') return
    if (mode === 'unfocused' && vscode.window.state.focused) return
    for (const event of batch.events) {
      if (!sameWorkspacePath(event.cwd, workspacePath)) continue
      const outcome = turnEventOutcome(event)
      if (outcome === undefined) continue
      this.notify(outcome, workspacePath)
    }
  }

  /**
   * Record where this window's consumption of one server's feed starts.
   *
   * Whatever the feed already holds when the window first resolves the port is
   * history. A missing feed means the server has not finished a turn yet, so
   * the first payload to appear is this window's own; the empty `runId` cursor
   * tells `advanceTurnEventCursor` to consume it whole.
   * @param port - the server's bound port.
   * @param file - that server's feed path.
   */
  private seedBaseline(port: number, file: string): void {
    this.baselinePort = port
    this.stamp = ''
    const feed = this.readFeed(file)
    this.cursor = feed === undefined
      ? { runId: '', lastSeq: 0 }
      : { runId: feed.runId, lastSeq: turnEventMaxSeq(feed) }
  }

  /**
   * Read and validate one feed file.
   * @param file - absolute feed path.
   * @returns the validated feed, or undefined when the file is absent or unusable.
   */
  private readFeed(file: string): TurnEventFeed | undefined {
    let text: string
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      return undefined
    }
    const feed = parseTurnEventFeed(text)
    if (feed === undefined) logger.info(`[dshui] ignored unusable turn feed at ${file}`)
    return feed
  }

  /**
   * Raise one notification for a finished turn.
   *
   * The OS notification center is the primary channel; the in-app toast is
   * only the fallback for platforms or hosts where no system command works
   * (Windows today, a denied notification permission, a missing notify-send,
   * or a failed spawn).
   * @param outcome - `completed` or `failed` reading of the boundary.
   * @param workspacePath - this window's workspace root (its folder names the message).
   */
  private notify(outcome: TurnEventOutcome, workspacePath: string): void {
    void this.deliver(outcome, workspacePath)
  }

  /**
   * Deliver one notification through the best available channel.
   * @param outcome - `completed` or `failed` reading of the boundary.
   * @param workspacePath - this window's workspace root.
   */
  private async deliver(outcome: TurnEventOutcome, workspacePath: string): Promise<void> {
    const folder = path.basename(workspacePath)
    const body = outcome === 'completed'
      ? L(`Turn finished in ${folder}`, `${folder} 本轮已完成`)
      : L(`Turn failed in ${folder}`, `${folder} 本轮出错`)
    // The click opens this extension's focus URI; VS Code may ask once for
    // permission ("Allow '<extension>' extension to open this URI?"), which is
    // the narrow, per-extension trust the notification needs. The URI handler
    // then focuses the window that has this folder open.
    const focusFolder = this.options.workspaceFolder?.() ?? workspacePath
    const uri = focusUri(this.options.extensionId, focusFolder)
    if (await sendSystemNotification({ title: 'dsh', body, focusUri: uri }, this.options.assets)) {
      logger.info(`[dshui] turn ${outcome} system notification for ${folder}`)
      return
    }
    const open = L('Open', '打开')
    const message = outcome === 'completed'
      ? L(`dsh: turn finished in ${folder}`, `dsh：${folder} 本轮已完成`)
      : L(`dsh: turn failed in ${folder}`, `dsh：${folder} 本轮出错`)
    logger.info(`[dshui] turn ${outcome} in-app notification for ${folder}`)
    const shown = outcome === 'failed'
      ? vscode.window.showWarningMessage(message, open)
      : vscode.window.showInformationMessage(message, open)
    void shown.then((choice) => {
      if (choice === open) void vscode.commands.executeCommand('dshui.open')
    })
  }
}
