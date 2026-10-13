/**
 * dshui for VS Code — entry point.
 *
 * The extension embeds the dsh web UI in a sidebar WebviewView. It spawns a
 * `dsh --profile web` server with its working directory set to the folder
 * opened in VS Code, so that folder IS the dsh workspace (no workspace
 * picker). The dshui plugin overlay scopes the sidebar to that workspace's
 * sessions and pins the input box to the bottom.
 */
import * as fs from 'node:fs'
import * as https from 'node:https'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { bundledCliPath, DshServer, probeDshuiMarker, probeDshuiServer, verifyLaunchToken } from './dshServer'
import { installCrashHandlers, logger, setLogFile } from './logger'
import { killProcessOnPort } from './killPort'
import { OpenBridge } from './openBridge'
import { WindowProxy } from './windowProxy'
import { isObject, RollbackReviewManager, type RollbackFileChange } from './rollbackReview'
import { ensureProfileBundle, installPlugins, resolveDshHome, type InstalledPlugin } from './plugins'
import {
  bridgesPath, readRegistry, registerBridge, registerServerUser, startServerUserHeartbeat,
  unregisterBridge, unregisterServerUser, writeWorkspaceMarker,
} from './sharedBackend'
import {
  buildFileReference,
  buildSnippetReference,
  type ReferencePayload,
} from './reference'

const VIEW_ID = 'dshui.view'

/**
 * Minimal structural check for the dock-supplied review `change` payload
 * (crossed the webview boundary via postMessage, so it is untrusted): it must
 * be an object whose path matches the requested one and whose `hunks` — when
 * present — is an array. Anything else makes the extension fall back to the
 * RPC path.
 */
function isReviewChange(value: unknown, path: string): value is RollbackFileChange {
  if (!isObject(value)) return false
  if (value.path !== path) return false
  if (value.hunks !== undefined && !Array.isArray(value.hunks)) return false
  return true
}

/** npm registry URL returning the latest published @deepseek-ai/dsh release as JSON `{ version }`. */
const DSHD_REGISTRY_URL = 'https://registry.npmjs.org/@deepseek-ai%2Fdsh/latest'

/** Prerelease-aware semver compare: <0 / 0 / >0 (e.g. 0.1.0 > 0.1.0-rc.6). */
function compareVersions(a: string, b: string): number {
  const parse = (v: string): { nums: number[]; pre: string[] } => {
    const [core, pre = ''] = v.split('-')
    return {
      nums: core.split('.').map((n) => Number.parseInt(n, 10)),
      pre: pre === '' ? [] : pre.split('.'),
    }
  }
  const x = parse(a)
  const y = parse(b)
  const numLen = Math.max(x.nums.length, y.nums.length)
  for (let i = 0; i < numLen; i += 1) {
    const diff = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (diff !== 0) return diff
  }
  if (x.pre.length === 0 && y.pre.length === 0) return 0
  if (x.pre.length === 0) return 1
  if (y.pre.length === 0) return -1
  const preLen = Math.max(x.pre.length, y.pre.length)
  for (let i = 0; i < preLen; i += 1) {
    const xp = x.pre[i] ?? ''
    const yp = y.pre[i] ?? ''
    if (xp === yp) continue
    const xn = /^\d+$/.test(xp) ? Number.parseInt(xp, 10) : Number.NaN
    const yn = /^\d+$/.test(yp) ? Number.parseInt(yp, 10) : Number.NaN
    if (!Number.isNaN(xn) && !Number.isNaN(yn)) return xn - yn
    // 数字标识符的优先级低于字母标识符（semver 规则）。
    return xp < yp ? -1 : 1
  }
  return 0
}

/** Read the bundled CLI version from the extension's own node_modules; null on any failure. */
function readBundledDshVersion(extensionRoot: string): string | null {
  try {
    const pkg = require(path.join(extensionRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')) as { version?: unknown }
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

/** Fetch the latest published dsh version; null on any failure (network/parse — never throws). */
function fetchLatestDshVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(DSHD_REGISTRY_URL, { timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        resolve(null)
        return
      }
      res.setEncoding('utf8')
      let body = ''
      res.on('data', (chunk: string) => { body += chunk })
      res.on('end', () => {
        try {
          const data = JSON.parse(body) as { version?: unknown }
          resolve(typeof data.version === 'string' ? data.version : null)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => { resolve(null) })
  })
}

/**
 * Port of dsh's JSONL session-persistence path encoding
 * (dsh-session-persistence-jsonl/src/format.ts): a SessionId is an
 * unvalidated branded string, so every unsafe code unit becomes `~XXXX`
 * before any filesystem use; safe units stay literal.
 * @param raw - the session id.
 * @returns one filesystem-safe path segment, decodable back to `raw`.
 */
function encodeSessionSegment(raw: string): string {
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

/**
 * Port of dsh's `projectKey`: the human-navigable, filesystem-safe directory
 * name under `$DSH_HOME/sessions` for one workspace path. Separators become
 * `-` (runs collapse), unsafe code units use the same `~XXXX` escape, and
 * the slug is bounded for filesystem component limits.
 * @param cwd - the session's project directory.
 * @returns a single filesystem-safe project directory name.
 */
function sessionProjectKey(cwd: string): string {
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i += 1) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}

/**
 * The session-owned directory (its log plus any future session-local
 * artifacts) under the dsh home.
 * @param dshHome - the dsh home directory.
 * @param sessionId - the session id (path-encoded before filesystem use).
 * @param cwd - the session's project directory.
 * @returns the absolute session directory path.
 */
function sessionDirPath(dshHome: string, sessionId: string, cwd: string): string {
  return path.join(dshHome, 'sessions', sessionProjectKey(cwd), encodeSessionSegment(sessionId))
}

/** Result of one session-file deletion, relayed back to the embedded UI. */
interface DeleteSessionResult {
  ok: boolean
  error?: string
}

/**
 * Delete a session's persisted directory through the VS Code file API
 * (`workspace.fs.delete`). The request carries the session's own cwd (from
 * its list summary), so ungrouped sessions resolve too; the encoded path is
 * guaranteed to stay inside the dsh sessions root. A missing directory
 * counts as success — the goal, the session being gone, already holds.
 * @param dshHome - the dsh home directory.
 * @param sessionId - the session id.
 * @param cwd - the session's project directory.
 * @returns the deletion result for the UI.
 */
async function deleteSessionFile(dshHome: string, sessionId: string, cwd: string): Promise<DeleteSessionResult> {
  const sessionsRoot = path.join(dshHome, 'sessions')
  const target = sessionDirPath(dshHome, sessionId, cwd)
  if (!target.startsWith(sessionsRoot + path.sep)) {
    return { ok: false, error: 'session path escaped the dsh sessions root' }
  }
  try {
    await vscode.workspace.fs.delete(vscode.Uri.file(target), { recursive: true })
    return { ok: true }
  } catch (error) {
    const code = (error as { code?: unknown })?.code
    if (code === 'FileNotFound' || code === 'ENOENT') return { ok: true }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // dsh ≥ 0.1.0-rc.7 requires embedded Node ≥ 22.19 (`^22.19.0 || >=24.0.0`);
  // the server runs on the SAME executable as the extension host (Electron +
  // ELECTRON_RUN_AS_NODE=1), so the host's `process.versions.node` is the
  // runtime version. `engines.vscode ^1.105.0` already blocks older VS Code
  // at install time (1.105.0 bundles Node 22.19.0); this guard is the
  // fail-fast backstop with an actionable message instead of a cryptic server
  // boot failure.
  const MIN_NODE = '22.19.0'
  const MIN_VSCODE = '1.105.0'
  if (compareVersions(process.versions.node, MIN_NODE) < 0) {
    const message = `dsh UI: 当前 VS Code 内嵌 Node.js v${process.versions.node} 过低（dsh rc7 需要 ≥ ${MIN_NODE}）。请升级 VS Code 到 ${MIN_VSCODE} 或更高版本后重载窗口。`
    vscode.window.showErrorMessage(message)
    installCrashHandlers(context.extensionPath)
    setLogFile(path.join(resolveDshHome(), 'dshui-logs', 'extension.log'))
    logger.error(`[dshui] activation blocked: embedded node ${process.versions.node} < ${MIN_NODE} (upgrade VS Code to >= ${MIN_VSCODE})`)
    logger.dispose()
    return
  }
  // Crashes inside the extension host leave a trace in the Output panel.
  installCrashHandlers(context.extensionPath)
  const extensionRoot = context.extensionPath
  const pluginsDir = path.join(extensionRoot, 'dshui-plugins')
  const patchPath = path.join(extensionRoot, 'patch.yml')
  const cliPath = bundledCliPath(extensionRoot)
  const dshHome = resolveDshHome()
  // File sink for headless verification (the extension host console is not
  // observable from the CLI); every log line also goes to the Output panel.
  setLogFile(path.join(dshHome, 'dshui-logs', 'extension.log'))
  // `code` CLI 绝对路径：应用内置 bin/code（Finder 启动的扩展宿主 PATH 精简，
  // 不能依赖 PATH 解析）。找不到时退回裸命令名，由补丁里的 runNativeCommand 按 PATH 尝试。
  const codeCli = (() => {
    const candidate = path.join(vscode.env.appRoot, 'bin', process.platform === 'win32' ? 'code.cmd' : 'code')
    return fs.existsSync(candidate) ? candidate : 'code'
  })()
  logger.info(`[dshui] activate: ext=${extensionRoot} dshHome=${dshHome}`)
  try {
    const installed = installPlugins(pluginsDir, dshHome, path.join(extensionRoot, 'node_modules'))
    logger.info(`[dshui] installed ${installed.length} plugin(s) (${installed.map(p => p.name).join(', ')}) into ${path.join(dshHome, 'profiles', 'node_modules')}`)
    const bundlesChanged = ensureProfileBundle(dshHome)
    logger.info(`[dshui] web profile bundle registration ${bundlesChanged ? 'updated' : 'already current'}`)
  } catch (error) {
    logger.error('[dshui] failed to install dshui plugins:', error)
    vscode.window.showErrorMessage(`dshui: failed to install dshui plugins: ${String(error)}`)
  }

  let server: DshServer | null = null
  let serverStart: Promise<number> | null = null
  /** The dsh launch token for the active server (empty when none/attached without it). */
  let serverLaunchToken = ''
  let currentView: vscode.WebviewView | null = null
  let currentWorkspacePath: string | undefined
  let registeredSharedUser = false
  let serverUserHeartbeat: NodeJS.Timeout | null = null
  /** Shared-server liveness watchdog (see `watchSharedServer`). */
  let serverWatch: NodeJS.Timeout | null = null
  /** Set by the dispose handler: no recovery path may start a server afterwards. */
  let deactivating = false
  /**
   * Bounded budget of automatic shared-server recoveries. A server that keeps
   * exiting right after boot must not turn into an endless respawn loop, so
   * the budget is only returned once a server has stayed up for
   * `SERVER_RECOVERY_STABLE_MS`.
   */
  let serverRecoveries = 0
  const MAX_SERVER_RECOVERIES = 2
  const SERVER_RECOVERY_STABLE_MS = 5 * 60_000
  /** Wait a moment before re-rendezvousing, so another window's respawn can land first. */
  const SERVER_RECOVERY_DELAY_MS = 1500
  let recoveryResetTimer: NodeJS.Timeout | null = null
  /** How often the shared-server watchdog re-checks the port this window uses. */
  const SERVER_WATCH_MS = 15_000
  /**
   * Server generation (port plus the launch token the live process accepted)
   * the panel is currently pointed at. A different generation means another
   * process now serves the rendezvous port: the page's WebSocket died with the
   * old one and must be rebuilt (see `watchSharedServer`).
   */
  let navigatedGeneration = ''
  const reviewManager = new RollbackReviewManager()
  reviewManager.onDidChange = () => {
    if (currentView !== null) {
      void currentView.webview.postMessage({ type: 'dshui:modificationsChanged' })
    }
  }

  // Route dsh's file-open gestures into the running VS Code instead of the
  // OS default editor (or the vscode:// scheme with its confirmation popup),
  // unless the user opted out. The open bridge is a local HTTP endpoint the
  // api-proxy patch calls; the patched server then opens via the VS Code API.
  const openInVscode = vscode.workspace.getConfiguration('dshui').get<boolean>('openFilesInVscode') ?? true
  const openBridge = new OpenBridge()
  if (openInVscode) {
    try {
      await openBridge.start()
      logger.info(`[dshui] open bridge listening at ${openBridge.endpoint}`)
    } catch (error) {
      logger.error('[dshui] open bridge failed to start:', error)
    }
    // 登记本窗口的桥：源码编译后的 host 原生 opener（dshui-host-bundles.patch）
    // 按「打开路径所属工作区」路由到对应窗口的桥，这样共享后端下点开的文件能在
    // 当前窗口打开（而不总是落在 owner 窗口）。
    if (openBridge.running) {
      const initialWorkspace = currentWorkspace()
      if (initialWorkspace !== undefined) {
        void registerBridge(dshHome, initialWorkspace, openBridge.endpoint, openBridge.token).catch((error) => {
          logger.error('[dshui] bridge registration failed:', error)
        })
      }
    }
  }

  // Each window loads the shared server through its own loopback origin, so the
  // browser's per-origin HTTP pool and storage belong to this window alone (see
  // `WindowProxy`): a shared origin lets one window's leaked or saturated
  // connections silently swallow every other window's RPC POSTs.
  const isolatedOrigin = vscode.workspace.getConfiguration('dshui').get<boolean>('windowOrigin') ?? true
  const windowProxy = new WindowProxy({
    targetPort: () => server?.port,
    scope: () => currentWorkspace() ?? '',
  })

  // dsh 版本感知：启动时异步对比 npm 最新版与内置 CLI，过旧且未提示过时通知。
  // 静默失败（无网络/解析错误不打扰）；24 小时节流；同一新版本只提示一次；
  // 可用 dshui.checkDshUpdates 关闭。
  const checkDshUpdates = async (): Promise<void> => {
    try {
      const enabled = vscode.workspace.getConfiguration('dshui').get<boolean>('checkDshUpdates') ?? true
      if (!enabled) return
      const now = Date.now()
      const lastCheck = context.globalState.get<number>('dshui.dshCheck.last') ?? 0
      if (now - lastCheck < 24 * 60 * 60 * 1000) return
      await context.globalState.update('dshui.dshCheck.last', now)
      const bundled = readBundledDshVersion(extensionRoot)
      if (bundled === null) return
      const latest = await fetchLatestDshVersion()
      if (latest === null) return
      const outdated = compareVersions(latest, bundled) > 0
      logger.info(`[dshui] dsh update check: bundled=${bundled} latest=${latest} outdated=${outdated}`)
      if (!outdated || latest === context.globalState.get<string>('dshui.dshCheck.notified')) return
      await context.globalState.update('dshui.dshCheck.notified', latest)
      const action = await vscode.window.showInformationMessage(
        `dsh 有新版本（${bundled} → ${latest}）：插件内置旧版 CLI，升级需按 README 的「跟随 dsh 版本升级」流程重新打包安装插件。`,
        '打开 npm 页面',
      )
      if (action === '打开 npm 页面') {
        void vscode.env.openExternal(vscode.Uri.parse('https://www.npmjs.com/package/@deepseek-ai/dsh'))
      }
    } catch (error) {
      logger.error('[dshui] dsh update check failed:', error)
    }
  }
  void checkDshUpdates()

  /** Current workspace root (canonicalized) or undefined. */
  function currentWorkspace(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0]
    if (folder === undefined) return undefined
    const raw = folder.uri.fsPath
    try { return fs.realpathSync(raw) } catch { return raw }
  }

  /**
   * The launch token the server listening on `port` actually accepts, or ''
   * when no candidate is accepted.
   *
   * A shared server outlives the window that spawned it and can be replaced by
   * another window, so the token this window cached at attach time may belong
   * to a dead process. Such a token is still an authenticated request (the
   * webview keeps a signed cookie), but the index answers it with a bare `./`
   * redirect that drops every query parameter — `dshui_workspace` included —
   * and the panel then silently adopts the server's own working directory as
   * its workspace, so new sessions land in the wrong folder. Loading the index
   * with no token at all avoids that redirect: the cookie-authenticated
   * response keeps the scope from the URL.
   * @param port - the shared server's loopback port.
   * @returns the accepted token, or '' to load the index without one.
   */
  async function resolveLaunchToken(port: number): Promise<string> {
    const candidates = new Set<string>()
    if (server !== null && server.port === port) candidates.add(server.launchTokenValue)
    candidates.add(readRegistry(dshHome)?.token ?? '')
    candidates.add(serverLaunchToken)
    for (const candidate of candidates) {
      if (candidate === '') continue
      if (await verifyLaunchToken(port, candidate)) return candidate
    }
    logger.warn(`[dshui] no launch token accepted on port ${port}; loading the index cookie-authenticated`)
    return ''
  }

  /** The dsh UI color scheme matching VS Code's active color theme (high-contrast maps to its dark/light base). */
  function activeColorScheme(): 'dark' | 'light' {
    switch (vscode.window.activeColorTheme.kind) {
      case vscode.ColorThemeKind.Dark:
      case vscode.ColorThemeKind.HighContrast:
        return 'dark'
      default:
        return 'light'
    }
  }

  /** Forward the active VS Code color scheme to the view shell (the theme relay). */
  function postTheme(webview: vscode.Webview): void {
    void webview.postMessage({ type: 'dshui:theme', colorScheme: activeColorScheme() })
  }

  /**
   * Log a dsh server failure and notify the user, offering to open the
   * "dsh UI" Output channel for the full detail (server stdout included).
   */
  function notifyServerFailure(message: string, error: unknown, language: 'zh' | 'en' = 'en'): void {
    logger.error('[dshui] dsh server failure:', error)
    const action = language === 'zh' ? '查看日志' : 'View Logs'
    void vscode.window.showErrorMessage(message, action).then((choice) => {
      if (choice === action) logger.show()
    })
  }

  /**
   * (Re)start the server for the given workspace, reusing a live one bound to
   * the same folder. An adopted (child-less) handle can outlive the process it
   * points at; every URL built for such a handle resolves the launch token
   * against the live server first (see {@link resolveLaunchToken}).
   */
  function startServer(workspacePath: string): Promise<number> {
    if (server !== null && server.running && server.port !== undefined && server.cwd === workspacePath) {
      return Promise.resolve(server.port)
    }
    if (serverStart !== null) return serverStart
    const configPort = vscode.workspace.getConfiguration('dshui').get<number>('server.port') ?? 0
    // dsh ≥ 0.1.6 probes Node/V8 internals through a native addon that cannot
    // load in VS Code's Electron runtime, so the CLI runs on an external
    // Node.js binary when one is available; empty = auto-detect and fall back
    // to Electron (see resolveDshRuntime).
    const nodePath = vscode.workspace.getConfiguration('dshui').get<string>('server.nodePath') ?? ''
    const shared = configPort > 0
    const port = configPort > 0 ? configPort : 0
    /** In-flight shared-user removal (see the retire block); awaited before re-registering. */
    let pendingUnregister: Promise<void> = Promise.resolve()
    // A live server bound to a different folder must be retired before the
    // new one spawns (the cwd is the workspace identity) — except a fixed-port
    // shared server that this window can simply attach back to with the new
    // workspace scope. Stopping a shared server here races with another
    // window's attach/register sequence, so shared servers are never stopped
    // by `startServer`; the host plugin reaps them once the registry is empty.
    if (server !== null) {
      const old = server
      server = null
      const oldIsShared = old.shared || old.lifecycleShared
      const keepSharedUser = shared && oldIsShared && old.running
        && old.port !== undefined && old.port === configPort
        && old.requestedPort === configPort
      if (oldIsShared) {
        // Abandoning a shared server: remove our user record and leave the
        // detached process alone. If this window was the last user, the host
        // plugin will exit it after its empty-registry grace polls.
        // 预登记必须排在这笔摘除之后：否则两者会争用注册表锁，摘除后落笔
        // 会把刚写好的租约又删掉。
        if (!keepSharedUser) {
          pendingUnregister = unregisterServerUser(dshHome, true).catch(() => { /* best-effort */ })
        }
      } else {
        // Non-shared server: private to this window, safe to stop immediately.
        void old.stop()
      }
    }
    const notifyReady = (boundPort: number): void => {
      // The child we spawned prints its own token on the boot URL, which is
      // authoritative. An adopted handle has none: its token is resolved (and
      // verified against the live server) on every navigation instead, since
      // the registry record may still describe the process it replaced.
      serverLaunchToken = server?.launchTokenValue || serverLaunchToken
      logger.info(`[dshui] dsh web ready on port ${boundPort} for ${workspacePath}`)
      serverStart = null
      // 只有稳定运行一段时间的服务器才归还自愈预算，避免「起来就死」的无限重启。
      if (recoveryResetTimer !== null) clearTimeout(recoveryResetTimer)
      recoveryResetTimer = setTimeout(() => { serverRecoveries = 0 }, SERVER_RECOVERY_STABLE_MS)
      recoveryResetTimer.unref()
      if (currentView !== null && currentWorkspacePath === workspacePath) {
        void navigate(currentView.webview, workspacePath, boundPort)
      }
    }
    // 共享后端：把本窗口登记为共享服务器的用户（owner = 自己拉起的服务器）。
    const registerUse = async (boundPort: number, owner: boolean): Promise<void> => {
      registeredSharedUser = true
      serverUserHeartbeat ??= startServerUserHeartbeat(dshHome)
      try {
        await registerServerUser(dshHome, boundPort, owner, server?.launchTokenValue)
      } catch (error) {
        logger.error('[dshui] shared registry register failed:', error)
      }
    }
    /**
     * spawn **之前**的预登记。host 插件在服务器启动后立刻开始空注册表自检
     * （5 × 2s），而 boot URL 要经扩展宿主的 stdout 处理才能到达这里：冷启动
     * 时宿主经常整块卡死十几秒，注册必然晚于自检，刚起来的服务器就会把自己
     * 杀掉。共享模式端口固定且已知，所以先把租约写进注册表并启动心跳——宿主
     * 随后再卡，磁盘上的租约（TTL 45s）依然是新鲜的。
     */
    const preRegisterSharedUser = async (): Promise<void> => {
      if (!shared) return
      await pendingUnregister
      registeredSharedUser = true
      serverUserHeartbeat ??= startServerUserHeartbeat(dshHome)
      try {
        await registerServerUser(dshHome, port, false)
      } catch (error) {
        logger.error('[dshui] shared registry pre-register failed:', error)
      }
    }
    serverStart = (async () => {
      if (shared) {
        // 先登记租约再拉服务器：见 preRegisterSharedUser 的说明（冷启动竞态）。
        await preRegisterSharedUser()
        // 会合探测：固定端口上已有 dshui 服务器（另一窗口启动的）→ 直接采纳，
        // 注册自己的工作区（host 插件会经 marker 登记）并以普通用户身份加入。
        if (await probeDshuiServer(port)) {
          server = DshServer.attach(port, workspacePath)
          // Adopt the live server's launch token so the browser-auth index can
          // exchange it for a signed cookie (otherwise this window's webview
          // 401s). Resolution verifies every candidate against that server, so
          // a registry record left behind by a dead process is never reused.
          writeWorkspaceMarker(dshHome, workspacePath)
          await registerUse(port, false)
          notifyReady(port)
          return port
        }
        // No compatible dshui server on the port. Do NOT auto-reclaim here: a
        // probe can transiently miss the boot manifest (a restarting/starting
        // server), and killing a valid shared server would disrupt every window.
        // If a genuinely incompatible server holds the port, the fresh spawn
        // below fails with EADDRINUSE and surfaces that clearly instead.
        if (shared && await probeDshuiMarker(port)) {
          logger.warn(
            `[dshui] detected an incompatible dshui server on port ${port}; spawning a fresh one (if it fails to bind, the port is held by an older-version server)`,
          )
        }
      }
      const created = new DshServer({
        cwd: workspacePath,
        dshHome,
        patchPath,
        cliPath,
        port,
        nodePath,
        sharedBackend: shared,
        onReady: notifyReady,
        onExit: (code, signal) => {
          logger.warn(`[dshui] dsh web exited (code ${String(code)}, signal ${String(signal)})`)
          // 退出（含 host 插件的空注册表自回收）后必须清掉进行中槽位：否则后续
          // startServer / restartServer 会一直拿到那个已解析的旧 promise，把面板
          // 钉死在死端口上（断联后再也无法恢复）。
          if (server === created) serverStart = null
          // 主动 stop()（重载窗口、dshui.restartServer 重启自有服务器）不算意外退出。
          if (deactivating || created.stoppingRequested) return
          // 共享服务器在本窗口仍存活时被回收：延迟重新会合（probe 命中别的窗口
          // 重新拉起的服务就直接采纳，否则本窗口成为新 owner）。只接管干净的
          // 退出（code 0 = host 插件的空注册表自回收）；崩溃/被信号杀死由
          // DshServer 自己的重启逻辑处理，两边同时拉起会白跑一次固定端口竞态。
          if (shared && server === created && code === 0) recoverSharedServer()
        },
        env: {
          ...(openBridge.running ? { DSHUI_OPEN_ENDPOINT: openBridge.endpoint, DSHUI_OPEN_TOKEN: openBridge.token } : {}),
          // 桥不可用时的回退：应用内 `code` CLI 绝对路径（补丁的 dshuiOpenViaCli 使用）。
          DSHUI_CODE_CLI: codeCli,
          // 各窗口桥的注册表（补丁的 dshuiPickBridgeForPath 按工作区前缀路由）。
          DSHUI_BRIDGES_FILE: bridgesPath(dshHome),
          // host 插件只应在共享后端模式下参与生命周期自检；
          // port=0 的各窗口服务器是相互独立的，不能因共享的空注册表自杀。
          DSHUI_SHARED_BACKEND: shared ? '1' : '0',
        },
      })
      server = created
      // 服务器自身（含 api-proxy 补丁）的 stdout/stderr 转发到输出面板与日志文件，
      // 排查服务器侧问题（插件加载失败、补丁报错等）直接看 Output → dsh UI。
      server.onOutput((line) => {
        logger.info(`[dshui:server] ${line}`)
      })
      const boundPort = await server.start()
      if (shared) {
        if (server.shared) {
          // spawn 竞态落败、采纳了另一窗口的服务器：注册工作区 + 普通用户。
          writeWorkspaceMarker(dshHome, workspacePath)
          await registerUse(boundPort, false)
          notifyReady(boundPort)
        } else {
          // 自己启动了服务器：成为 owner。
          await registerUse(boundPort, true)
          // 也要走一次 ready：它复位 serverStart（否则本窗口此后永远拿到旧的
          // 已解析 promise，无法再拉起已退出的服务器）并把 iframe 指到新地址。
          notifyReady(boundPort)
        }
      }
      return boundPort
    })().catch((error) => {
      // 一次失败的启动不能毒化后续尝试：清空进行中槽位（否则后续
      // startServer/重启命令会永远拿到同一个已拒绝的 promise）。
      serverStart = null
      throw error
    })
    return serverStart
  }

  /**
   * A shared server was reaped while this window is still alive: re-rendezvous
   * after a short delay. `startServer` probes first, so when another window has
   * already respawned the server this window simply attaches to it; only when
   * nobody did does this window become the new owner. Bounded by
   * `MAX_SERVER_RECOVERIES`, so a persistent exit cause (a broken dsh install,
   * a port that cannot be rebound) cannot turn into an endless respawn loop.
   */
  function recoverSharedServer(): void {
    if (deactivating || serverRecoveries >= MAX_SERVER_RECOVERIES) return
    serverRecoveries += 1
    setTimeout(() => {
      if (deactivating) return
      if (server !== null && server.running) return
      const workspacePath = currentWorkspace()
      if (workspacePath === undefined) return
      void startServer(workspacePath).catch((error) => {
        logger.error('[dshui] shared server recovery failed:', error)
      })
    }, SERVER_RECOVERY_DELAY_MS)
  }

  /** Build the server URL for one scope. The URL also
   *  carries the current VS Code color scheme (`dshui_theme`) so the embedded
   *  SPA boots with the right palette before any relayed message arrives. Since
   *  dsh 0.1.2 the index is behind browser-token auth, so the dsh launch token
   *  rides the URL too (`token=`), letting the server mint a signed cookie. */
  function makeUrl(workspacePath: string, origin: string, token: string): string {
    return `${origin}/?${token === '' ? '' : `token=${encodeURIComponent(token)}&`}dshui_workspace=${encodeURIComponent(workspacePath)}&dshui_theme=${activeColorScheme()}`
  }

  /**
   * The origin the panel loads the shared server from: this window's own
   * loopback proxy when origin isolation is on, the shared server directly
   * otherwise. Falls back to the shared server when the proxy cannot bind, so
   * a proxy failure degrades instead of hiding the panel.
   */
  async function serverOrigin(port: number): Promise<string> {
    const direct = `http://127.0.0.1:${port}`
    if (!isolatedOrigin) return direct
    try {
      if (!windowProxy.running) {
        await windowProxy.start()
        logger.info(`[dshui] window origin listening at ${String(windowProxy.origin)} for 127.0.0.1:${port}`)
      }
    } catch (error) {
      logger.error('[dshui] window origin failed to start:', error)
      return direct
    }
    return windowProxy.origin ?? direct
  }

  /**
   * The boot URL for one scope, with the launch token verified against the
   * live server first (see `resolveLaunchToken`). Building the URL is what
   * points the panel at a server generation, so the watchdog's bookkeeping
   * lives here.
   */
  async function scopedUrl(workspacePath: string, port: number): Promise<string> {
    const token = await resolveLaunchToken(port)
    const origin = await serverOrigin(port)
    navigatedGeneration = `${port}:${token}`
    return makeUrl(workspacePath, origin, token)
  }

  /** Point a view's iframe at the server URL for the given scope. */
  async function navigate(webview: vscode.Webview, workspacePath: string, port: number): Promise<void> {
    void webview.postMessage({ type: 'navigate', url: await scopedUrl(workspacePath, port) })
  }

  /**
   * Shared-server watchdog.
   *
   * An adopted (child-less) handle cannot observe the process it points at, so
   * a shared server that dies — self-reaped, crashed, or replaced by another
   * window's respawn — leaves this window's panel bound to a dead transport:
   * the page still accepts input and renders its last state, but every
   * submission is written into a closed socket and silently never reaches the
   * host (nothing is persisted, nothing is reported). Reloading the VS Code
   * window works around it, which is exactly the wrong thing to require.
   *
   * Each tick therefore (a) drops a dead adopted handle so `startServer`
   * re-rendezvouses, and (b) re-navigates the panel whenever the server
   * generation (port plus accepted launch token) differs from the one the page
   * was pointed at, so every window rebuilds its transport against the live
   * process on its own.
   */
  async function watchSharedServer(): Promise<void> {
    if (deactivating) return
    const configPort = vscode.workspace.getConfiguration('dshui').get<number>('server.port') ?? 0
    // Per-window servers (port 0) are owned children: their exit handler
    // already drives recovery, and there is no shared process to watch.
    if (configPort <= 0) return
    const view = currentView
    const workspacePath = currentWorkspacePath
    if (view === null || workspacePath === undefined) return
    const active = server
    if (active === null) {
      // A previous tick dropped a dead handle: re-rendezvous until a server
      // exists again (the host plugin reaps an unused one, so this cannot
      // leave a process behind after the last window closes).
      await startServer(workspacePath).catch((error) => {
        logger.error('[dshui] shared server re-rendezvous failed:', error)
      })
      return
    }
    if (active.port === undefined) return
    const port = active.port
    if (await probeDshuiServer(port, 1500, 2)) {
      const token = await resolveLaunchToken(port)
      const generation = `${port}:${token}`
      // The first observation after activation only records the generation:
      // the panel was just navigated, and reloading it again would interrupt
      // the user for nothing.
      if (navigatedGeneration === '') {
        navigatedGeneration = generation
        return
      }
      // Reload only for a different *accepted* token: that is a replacement
      // server process whose streams this page can no longer reach. A token the
      // registry has not caught up with resolves to '' and must not become a
      // reload loop — the page keeps working cookie-authenticated.
      const previousToken = navigatedGeneration.slice(navigatedGeneration.indexOf(':') + 1)
      if (token === '' || token === previousToken) {
        navigatedGeneration = generation
        return
      }
      logger.warn(`[dshui] shared server generation changed on port ${port}; reloading the panel`)
      await navigate(view.webview, workspacePath, port)
      return
    }
    logger.warn(`[dshui] shared server on port ${port} is gone; re-rendezvousing`)
    if (active.shared && server === active) {
      // Adopted handle whose process died: dropping it makes the next
      // startServer probe/attach/spawn instead of reusing the dead port.
      server = null
      serverLaunchToken = ''
      navigatedGeneration = ''
    }
    if (server === null) {
      await startServer(workspacePath).catch((error) => {
        logger.error('[dshui] shared server re-rendezvous failed:', error)
      })
    }
  }

  /**
   * The sidebar view shell: an iframe pointed at the dsh server. When `src`
   * is given the iframe boots straight into it (no about:blank flash); the
   * message listener still handles later re-navigation (server restarts).
   */
  function panelHtml(src?: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; frame-src http://127.0.0.1:*; style-src 'unsafe-inline'; img-src http://127.0.0.1:* data:;">
  <style>
    /* Match the workbench theme instead of flashing black while the SPA boots. */
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: var(--vscode-sideBar-background, #1e1e1e); }
    #frame { position: fixed; inset: 0; width: 100%; height: 100%; border: none; display: block; }
  </style>
</head>
<body>
  <iframe id="frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" src="${src ?? 'about:blank'}"></iframe>
  <script>
    // Reference relay: the extension posts { type: 'dshui:reference', ... }
    // messages here; this shell forwards them into the dsh SPA iframe. The
    // SPA announces readiness with { type: 'dshui:ready' } once its intake
    // listener is live, so references posted while the page loads are
    // buffered and flushed instead of dropped.
    //
    // Theme relay: the extension posts { type: 'dshui:theme', colorScheme }
    // (initially and on every VS Code theme change); the shell remembers the
    // latest value and forwards it, re-sending after navigations (server
    // restarts) once the fresh page re-announces readiness. The boot value
    // also rides the iframe URL (the 'dshui_theme' query param), so the first
    // paint is right even before any message lands.
    let pendingReferences = [];
    let lastTheme = null;
    let spaReady = false;
    const vscode = acquireVsCodeApi();
    const frame = document.getElementById('frame');
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      // SPA → extension: relay the dsh UI's host requests (session deletion)
      // up to the extension host, which performs the file operation.
      if (event.source === frame.contentWindow && data.type === 'dshui:deleteSession') {
        vscode.postMessage(data);
        return;
      }
      // SPA → extension: open an external link (http/https/mailto clicked in
      // a message) in the system browser — the webview blocks target=_blank.
      if (event.source === frame.contentWindow && data.type === 'dshui:openExternal' && typeof data.url === 'string') {
        vscode.postMessage({ type: 'openExternal', url: data.url });
        return;
      }
      // SPA → extension: open the rollback modification review panel in the
      // VS Code editor area instead of expanding the row inside the sidebar.
      if (event.source === frame.contentWindow && data.type === 'dshui:reviewModifications' && typeof data.sessionId === 'string' && typeof data.path === 'string') {
        vscode.postMessage(data);
        return;
      }
      if (data.type === 'navigate') {
        frame.src = data.url;
        spaReady = false; // the fresh page must re-announce readiness
        return;
      }
      if (data.type === 'dshui:ready') {
        spaReady = true;
        const pending = pendingReferences;
        pendingReferences = [];
        for (const payload of pending) frame.contentWindow.postMessage(payload, '*');
        if (lastTheme !== null) frame.contentWindow.postMessage({ type: 'dshui:theme', colorScheme: lastTheme }, '*');
        return;
      }
      if (data.type === 'dshui:theme' && (data.colorScheme === 'dark' || data.colorScheme === 'light')) {
        lastTheme = data.colorScheme;
        frame.contentWindow.postMessage({ type: 'dshui:theme', colorScheme: data.colorScheme }, '*');
        return;
      }
      if (data.type === 'dshui:reference' && typeof data.text === 'string') {
        if (spaReady && frame.contentWindow) frame.contentWindow.postMessage(data, '*');
        else pendingReferences.push(data);
        return;
      }
      if (data.type === 'dshui:sessionDeleted' && typeof data.sessionId === 'string') {
        if (frame.contentWindow) frame.contentWindow.postMessage(data, '*');
        return;
      }
      if (data.type === 'dshui:modificationsChanged') {
        if (frame.contentWindow) frame.contentWindow.postMessage(data, '*');
        return;
      }
    });
  </script>
</body>
</html>`
  }

  /** Shown in the view when no folder is open. */
  function noWorkspaceHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body { margin: 0; padding: 16px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>Open a folder in VS Code first — the opened folder becomes the dsh workspace.</body>
</html>`
  }

  // The sidebar view provider.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, {
      resolveWebviewView(webviewView: vscode.WebviewView): void {
        webviewView.webview.options = { enableScripts: true }
        // Session deletion from the embedded dsh UI: the workspace plugin
        // posts { type: 'dshui:deleteSession', sessionId, cwd } (relayed by
        // the shell); the host removes the session's persisted directory
        // through the VS Code file API and answers with
        // { type: 'dshui:sessionDeleted', sessionId, ok, error? }.
        webviewView.webview.onDidReceiveMessage((message: unknown) => {
          const data = message as { type?: unknown; sessionId?: unknown; cwd?: unknown; url?: unknown; path?: unknown; modificationId?: unknown; listId?: unknown; change?: unknown } | null
          if (data === null || typeof data !== 'object' || typeof data.type !== 'string') return
          // External link clicked in a message: open in the system browser.
          if (data.type === 'openExternal' && typeof data.url === 'string' && data.url !== '') {
            void vscode.env.openExternal(vscode.Uri.parse(data.url))
            return
          }
          if (data.type === 'dshui:reviewModifications') {
            if (typeof data.sessionId !== 'string' || data.sessionId === ''
              || typeof data.path !== 'string' || data.path === '') {
              return
            }
            const reviewSessionId = data.sessionId
            const reviewPath = data.path
            const reviewModificationId = typeof data.modificationId === 'string' && data.modificationId !== '' ? data.modificationId : undefined
            // The dock sends the list id and the already-computed file diff so
            // the panel opens without another rollback/sessionChanges round
            // trip. postMessage objects are untrusted: validate minimally
            // before handing them to the review manager.
            const reviewListId = typeof data.listId === 'string' && data.listId !== '' ? data.listId : undefined
            const reviewChange = isReviewChange(data.change, reviewPath) ? data.change : undefined
            const workspacePath = currentWorkspace()
            if (workspacePath === undefined) {
              void vscode.window.showWarningMessage('dsh UI: 请先打开一个文件夹（它将成为 dsh 工作区）。')
              return
            }
            void startServer(workspacePath).then((port) => {
              if (reviewModificationId !== undefined) {
                return reviewManager.showModification(port, reviewSessionId, reviewPath, reviewModificationId)
              }
              return reviewManager.showFile(port, reviewSessionId, reviewPath, reviewListId, reviewChange)
            }).catch((error) => {
              logger.error('[dshui] failed to open rollback review:', error)
              void vscode.window.showErrorMessage(`dshui: 打开修改视图失败: ${String(error)}`)
            })
            return
          }
          if (data.type !== 'dshui:deleteSession') return
          if (typeof data.sessionId !== 'string' || data.sessionId === ''
            || typeof data.cwd !== 'string' || data.cwd === '') {
            void webviewView.webview.postMessage({
              type: 'dshui:sessionDeleted',
              sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
              ok: false,
              error: 'invalid session delete request',
            })
            return
          }
          void deleteSessionFile(dshHome, data.sessionId, data.cwd).then((result) => {
            void webviewView.webview.postMessage({ type: 'dshui:sessionDeleted', sessionId: data.sessionId, ...result })
          })
        })
        // Minimize the view header: the contributed name is empty and the
        // runtime title too, leaving only the slim ⋯ actions strip (VS Code
        // always renders a header row for webview views — it cannot be removed).
        webviewView.title = ''
        const workspacePath = currentWorkspace()
        currentView = webviewView
        currentWorkspacePath = workspacePath
        if (workspacePath === undefined) {
          webviewView.webview.html = noWorkspaceHtml()
          return
        }
        // 主题跟随：把当前 VS Code 配色方案发给外壳（初始值同时随 URL
        // `dshui_theme` 携带，见 makeUrl），此后每次主题切换由
        // onDidChangeActiveColorTheme 重新推送。
        postTheme(webviewView.webview)
        // If a pre-warmed server is already bound to this folder, boot the
        // iframe straight into it — no about:blank flash.
        const runningServer = server
        const ready = runningServer !== null && runningServer.port !== undefined
          && runningServer.cwd === workspacePath
        if (ready) {
          // Boot the iframe straight into the server (no about:blank flash).
          // The token is verified before the URL is built, so an adopted server
          // whose process was replaced cannot strip this window's scope.
          const readyPort = runningServer.port
          void scopedUrl(workspacePath, readyPort).then((url) => {
            if (currentView === webviewView) webviewView.webview.html = panelHtml(url)
          })
          return
        }
        webviewView.webview.html = panelHtml()
        void startServer(workspacePath).then((port) => {
          if (currentView === webviewView) void navigate(webviewView.webview, workspacePath, port)
        }).catch((error) => {
          notifyServerFailure(`dshui: failed to start the dsh server: ${String(error)}`, error)
        })
        webviewView.onDidDispose(() => {
          if (currentView === webviewView) currentView = null
        })
      },
    }, { webviewOptions: { retainContextWhenHidden: true } }),
  )

  // Keep the embedded UI's color scheme in lockstep with the active VS Code
  // theme (the SPA resolves its `system` preference against this instead of
  // the OS scheme, see the injected THEME_PATCH in dshui-host-ensure-workspace).
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      if (currentView !== null) postTheme(currentView.webview)
    }),
  )

  // Command: reveal the sidebar view.
  context.subscriptions.push(
    vscode.commands.registerCommand('dshui.open', () => {
      void vscode.commands.executeCommand(`${VIEW_ID}.focus`)
    }),
  )

  // Command: open the same server in the system browser.
  context.subscriptions.push(
    vscode.commands.registerCommand('dshui.openInBrowser', async () => {
      const workspacePath = currentWorkspace()
      if (workspacePath === undefined) {
        vscode.window.showErrorMessage('dshui: open a folder in VS Code first.')
        return
      }
      const port = await startServer(workspacePath)
      // The system browser is an external client: it must not depend on this
      // window's per-window origin, which dies with the window. The verified
      // launch token still rides the URL so the browser can exchange it for a
      // signed cookie; without a token the index answers 401.
      const token = await resolveLaunchToken(port)
      void vscode.env.openExternal(vscode.Uri.parse(makeUrl(workspacePath, `http://127.0.0.1:${port}`, token)))
    }),
  )

  /**
   * Restart the embedded dsh server for the current workspace and re-navigate
   * the sidebar view. Owned server: stop the child and respawn on the same
   * config port. Adopted server (shared backend, another window spawned it):
   * this window has no child handle, so the listener process is terminated via
   * OS tools (`killProcessOnPort`) and the window respawns as the new owner on
   * the same port — the other windows' URLs keep working after their next
   * reload. Confirmation is requested first: an owned restart interrupts
   * in-flight agent runs (session data is persisted, nothing is lost); a
   * shared restart interrupts every window using the server.
   */
  async function restartServer(): Promise<void> {
    const workspacePath = currentWorkspace()
    if (workspacePath === undefined) {
      vscode.window.showErrorMessage('dsh UI: 请先打开一个文件夹（它将成为 dsh 工作区）。')
      return
    }
    // 等待任何进行中的启动收尾，再判断当前状态。
    if (serverStart !== null) {
      try { await serverStart } catch { /* 由下面的统一错误路径处理 */ }
    }
    if (server === null || !server.running || server.port === undefined) {
      // 服务器不在运行：直接（重新）启动即可，无需确认。
      try {
        await startServer(workspacePath)
        vscode.window.setStatusBarMessage('dsh UI: dsh server 已启动', 3000)
      } catch (error) {
        notifyServerFailure(`dshui: 启动 dsh server 失败: ${String(error)}`, error, 'zh')
      }
      return
    }
    const shared = server.shared
    const choice = await vscode.window.showWarningMessage(
      shared
        ? 'dsh UI: 当前 dsh 服务器由另一个窗口启动（共享后端），重启会中断其他窗口的连接。是否继续？'
        : 'dsh UI: 确定要重启 dsh server 吗？正在进行的任务会被中断（会话数据已持久化，不会丢失）。',
      { modal: shared },
      '重启',
      '取消',
    )
    if (choice !== '重启') return

    const old = server
    const oldPort = server.port
    server = null
    serverStart = null
    try {
      if (shared) {
        // 采纳的服务器没有子进程句柄：按端口找到监听进程并终止，然后自己
        // 在同一个端口重新拉起成为新 owner（其他窗口 URL 不变，重载即恢复）。
        const killed = await killProcessOnPort(oldPort)
        if (!killed) {
          server = old
          vscode.window.showWarningMessage('dsh UI: 未能停止共享 dsh server 进程，重启已取消。')
          return
        }
      } else {
        await old.stop()
      }
      await startServer(workspacePath)
      vscode.window.setStatusBarMessage('dsh UI: dsh server 已重启', 3000)
    } catch (error) {
      notifyServerFailure(`dshui: 重启 dsh server 失败: ${String(error)}`, error, 'zh')
    }
  }

  // Command: restart the embedded dsh server (Command Palette only — no
  // view/title button, to avoid accidental clicks).
  context.subscriptions.push(
    vscode.commands.registerCommand('dshui.restartServer', () => {
      void restartServer()
    }),
  )

  // Command: reveal the extension's Output channel (View → Output → dsh UI).
  context.subscriptions.push(
    vscode.commands.registerCommand('dshui.showLogs', () => {
      logger.show()
    }),
  )

  /**
   * Deliver a composer reference into the dsh SPA: focus the sidebar view
   * (resolving it if needed — the shell script is installed at resolve time),
   * wait briefly for the view, then post the message. The shell buffers until
   * the SPA announces readiness, so a still-booting panel does not drop it.
   */
  async function deliverReference(payload: ReferencePayload): Promise<void> {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`)
    for (let attempt = 0; attempt < 30 && currentView === null; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (currentView === null) {
      vscode.window.showWarningMessage('dsh UI: 侧边栏视图尚未就绪，无法插入引用，请稍后重试。')
      return
    }
    await currentView.webview.postMessage(payload)
  }

  // Shared handler for file/folder references: build the path link payload and
  // deliver it into the dsh composer — the agent reads the target itself with
  // its own tools.
  async function referencePath(target: vscode.Uri, workspacePath: string): Promise<void> {
    const payload = buildFileReference(target.fsPath, workspacePath)
    await deliverReference(payload)
    vscode.window.setStatusBarMessage(`dsh UI: 已引用 ${payload.path}`, 3000)
  }

  // Command: reference a file (explorer/editor/editor-tab context menu) into
  // the dsh composer.
  context.subscriptions.push(
    vscode.commands.registerCommand('dshui.referenceFile', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (target === undefined || target.scheme !== 'file') {
        vscode.window.showWarningMessage('dsh UI: 请先在资源管理器或编辑器中选中一个文件。')
        return
      }
      const workspacePath = currentWorkspace()
      if (workspacePath === undefined) {
        vscode.window.showWarningMessage('dsh UI: 请先打开一个文件夹（它将成为 dsh 工作区）。')
        return
      }
      await referencePath(target, workspacePath)
    }),
  )

  // Command: reference a folder (explorer context menu) into the dsh composer.
  context.subscriptions.push(
    vscode.commands.registerCommand('dshui.referenceFolder', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (target === undefined || target.scheme !== 'file') {
        vscode.window.showWarningMessage('dsh UI: 请先在资源管理器中选中一个文件夹。')
        return
      }
      const workspacePath = currentWorkspace()
      if (workspacePath === undefined) {
        vscode.window.showWarningMessage('dsh UI: 请先打开一个文件夹（它将成为 dsh 工作区）。')
        return
      }
      await referencePath(target, workspacePath)
    }),
  )

  // Command: reference the current editor selection (editor context menu) as a
  // code snippet with its line range embedded in a fenced block.
  context.subscriptions.push(
    vscode.commands.registerCommand('dshui.referenceSelection', async (uri?: vscode.Uri) => {
      const editor = uri !== undefined
        ? vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString())
        : vscode.window.activeTextEditor
      if (editor === undefined) {
        vscode.window.showWarningMessage('dsh UI: 请先打开一个编辑器并选中代码。')
        return
      }
      if (editor.selection.isEmpty) {
        vscode.window.showWarningMessage('dsh UI: 请先选中要引用的代码片段。')
        return
      }
      const workspacePath = currentWorkspace()
      if (workspacePath === undefined) {
        vscode.window.showWarningMessage('dsh UI: 请先打开一个文件夹（它将成为 dsh 工作区）。')
        return
      }
      const payload = buildSnippetReference({
        filePath: editor.document.uri.fsPath,
        workspacePath,
        languageId: editor.document.languageId,
        snippet: editor.document.getText(editor.selection),
        startLine: editor.selection.start.line + 1,
        endLine: editor.selection.end.line + 1,
      })
      await deliverReference(payload)
      vscode.window.setStatusBarMessage(`dsh UI: 已引用 ${payload.path} 的代码片段`, 3000)
    }),
  )

  // Restart the server and re-navigate when the workspace folder changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const workspacePath = currentWorkspace()
      if (workspacePath === undefined) return
      if (currentView === null || currentWorkspacePath === workspacePath) return
      currentWorkspacePath = workspacePath
      if (openBridge.running) {
        void registerBridge(dshHome, workspacePath, openBridge.endpoint, openBridge.token).catch((error) => {
          logger.error('[dshui] bridge registration failed:', error)
        })
      }
      void startServer(workspacePath).catch((error) => {
        notifyServerFailure(`dshui: failed to start the dsh server: ${String(error)}`, error)
      })
    }),
  )

  context.subscriptions.push({
    dispose: () => {
      // 先立起闸门：本窗口正在退出，任何退出自愈都不得再拉起服务器。
      deactivating = true
      if (recoveryResetTimer !== null) {
        clearTimeout(recoveryResetTimer)
        recoveryResetTimer = null
      }
      if (serverWatch !== null) {
        clearInterval(serverWatch)
        serverWatch = null
      }
      // 共享后端：窗口关闭时不再由 owner 直接 stop。owner 直接 stop 与
      // 其他窗口的 probe→attach→register 之间存在无法消除的 TOCTOU 竞态，
      // 会误停掉刚 attach 但尚未写进 users 的窗口。这里只摘除自己的
      // 注册项；detached server 的 host 插件在 5 个空轮询（约 10 秒）后
      // 自行退出，因此不会泄漏，也不会误伤其他窗口。
      const serverIsShared = server !== null && (server.shared || server.lifecycleShared)
      const sharedUser = server !== null ? serverIsShared : registeredSharedUser
      if (server !== null) {
        // 只有非共享模式（port=0）的 owned server 才在本窗口关闭时立即停；
        // 它与任何其他窗口都没有依赖关系。
        if (!server.shared && !server.lifecycleShared) {
          void server.stop()
        }
        server = null
      }
      // 先停心跳再摘除注册项，避免 unregister 完成后心跳又把本窗口写回去。
      if (serverUserHeartbeat !== null) {
        clearInterval(serverUserHeartbeat)
        serverUserHeartbeat = null
      }
      if (sharedUser) {
        void unregisterServerUser(dshHome, true).catch(() => { /* best-effort */ })
      }
      void unregisterBridge(dshHome).catch(() => { /* best-effort */ })
      openBridge.dispose()
      windowProxy.dispose()
      reviewManager.dispose()
      logger.dispose()
    },
  })

  // Shared-server liveness: an adopted handle cannot see its process die, and
  // a page left on a dead transport keeps accepting messages it can never
  // deliver (see `watchSharedServer`).
  serverWatch = setInterval(() => { void watchSharedServer() }, SERVER_WATCH_MS)
  serverWatch.unref()

  // Auto-open the sidebar view at startup when a folder is open (unless disabled).
  const autoOpen = vscode.workspace.getConfiguration('dshui').get<boolean>('autoOpen') ?? true
  if (autoOpen) {
    const workspacePath = currentWorkspace()
    if (workspacePath !== undefined) {
      // Pre-warm the dsh server now so the view (focused below) finds it
      // already bound — the iframe boots straight into the SPA instead of
      // sitting on a blank page while the server starts.
      void startServer(workspacePath).catch((error) => {
        notifyServerFailure(`dshui: failed to start the dsh server: ${String(error)}`, error)
      })
      void vscode.commands.executeCommand(`${VIEW_ID}.focus`)
    }
  }
}

export function deactivate(): void {
  // dshui plugin packages are left in place (idempotent reinstall on next
  // activation; another window may still be using them).
}
