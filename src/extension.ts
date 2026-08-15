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
import { bundledCliPath, DshServer, probeDshuiServer } from './dshServer'
import { killProcessOnPort } from './killPort'
import { OpenBridge } from './openBridge'
import { patchFileOpener } from './openPatch'
import { installPlugins, resolveDshHome, type InstalledPlugin } from './plugins'
import {
  bridgesPath, hasOtherLiveUsers, registerBridge, registerServerUser, unregisterBridge,
  unregisterServerUser, writeWorkspaceMarker,
} from './sharedBackend'
import {
  buildFileReference,
  buildSnippetReference,
  type ReferencePayload,
} from './reference'

const VIEW_ID = 'dshui.view'

/** npm registry URL returning the latest published @deepseek-ai/dsh release as JSON `{ version }`. */
const DSHD_REGISTRY_URL = 'https://registry.npmjs.org/@deepseek-ai%2Fdsh/latest'

/** Minimal file logger for headless verification (the extension host console is not observable from the CLI). */
function fileLog(dshHome: string, message: string): void {
  try {
    const logDir = path.join(dshHome, 'dshui-logs')
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(path.join(logDir, 'extension.log'), `${new Date().toISOString()} ${message}\n`)
  } catch { /* logging must never break activation */ }
}

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
  const extensionRoot = context.extensionPath
  const pluginsDir = path.join(extensionRoot, 'dshui-plugins')
  const patchPath = path.join(extensionRoot, 'patch.yml')
  const cliPath = bundledCliPath(extensionRoot)
  const dshHome = resolveDshHome()
  // `code` CLI 绝对路径：应用内置 bin/code（Finder 启动的扩展宿主 PATH 精简，
  // 不能依赖 PATH 解析）。找不到时退回裸命令名，由补丁里的 runNativeCommand 按 PATH 尝试。
  const codeCli = (() => {
    const candidate = path.join(vscode.env.appRoot, 'bin', process.platform === 'win32' ? 'code.cmd' : 'code')
    return fs.existsSync(candidate) ? candidate : 'code'
  })()
  fileLog(dshHome, `activate: ext=${extensionRoot} dshHome=${dshHome}`)
  try {
    const installed = installPlugins(pluginsDir, dshHome, path.join(extensionRoot, 'node_modules'))
    console.log(`[dshui] installed ${installed.length} plugin(s) into ${path.join(dshHome, 'profiles', 'node_modules')}`)
    fileLog(dshHome, `plugins installed: ${installed.map(p => p.name).join(', ')}`)
  } catch (error) {
    vscode.window.showErrorMessage(`dshui: failed to install dshui plugins: ${String(error)}`)
    fileLog(dshHome, `plugin install failed: ${String(error)}`)
  }

  let server: DshServer | null = null
  let serverStart: Promise<number> | null = null
  let currentView: vscode.WebviewView | null = null
  let currentWorkspacePath: string | undefined

  // Route dsh's file-open gestures into the running VS Code instead of the
  // OS default editor (or the vscode:// scheme with its confirmation popup),
  // unless the user opted out. The open bridge is a local HTTP endpoint the
  // api-proxy patch calls; the patched server then opens via the VS Code API.
  const openInVscode = vscode.workspace.getConfiguration('dshui').get<boolean>('openFilesInVscode') ?? true
  const openBridge = new OpenBridge()
  if (openInVscode) {
    try {
      await openBridge.start()
      fileLog(dshHome, `open bridge listening at ${openBridge.endpoint}`)
    } catch (error) {
      fileLog(dshHome, `open bridge failed to start: ${String(error)}`)
      console.error('[dshui] open bridge failed to start:', error)
    }
    const result = patchFileOpener(
      path.join(extensionRoot, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
    )
    fileLog(dshHome, `file opener patch: patched=${result.patched} note=${result.note ?? ''}`)
    // 登记本窗口的桥：api-proxy 补丁按「打开路径所属工作区」路由到对应窗口的桥，
    // 这样共享后端下点开的文件能在当前窗口打开（而不总是落在 owner 窗口）。
    if (openBridge.running) {
      const initialWorkspace = currentWorkspace()
      if (initialWorkspace !== undefined) {
        void registerBridge(dshHome, initialWorkspace, openBridge.endpoint).catch((error) => {
          fileLog(dshHome, `bridge registration failed: ${String(error)}`)
        })
      }
    }
  }

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
      fileLog(dshHome, `dsh update check: bundled=${bundled} latest=${latest} outdated=${outdated}`)
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
      fileLog(dshHome, `dsh update check failed: ${String(error)}`)
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

  /** (Re)start the server for the given workspace, reusing a live one bound to the same folder. */
  function startServer(workspacePath: string): Promise<number> {
    if (server !== null && server.running && server.port !== undefined && server.cwd === workspacePath) {
      return Promise.resolve(server.port)
    }
    if (serverStart !== null) return serverStart
    // A live server bound to a different folder must be retired before the
    // new one spawns (the cwd is the workspace identity).
    if (server !== null) {
      const old = server
      server = null
      void old.stop()
    }
    const configPort = vscode.workspace.getConfiguration('dshui').get<number>('server.port') ?? 0
    const shared = configPort > 0
    const port = configPort > 0 ? configPort : 0
    const notifyReady = (boundPort: number): void => {
      console.log(`[dshui] dsh web ready on port ${boundPort}`)
      fileLog(dshHome, `server ready on port ${boundPort} for ${workspacePath}`)
      serverStart = null
      if (currentView !== null && currentWorkspacePath === workspacePath) {
        navigate(currentView.webview, workspacePath, boundPort)
      }
    }
    // 共享后端：把本窗口登记为共享服务器的用户（owner = 自己拉起的服务器）。
    const registerUse = async (boundPort: number, owner: boolean): Promise<void> => {
      try {
        await registerServerUser(dshHome, boundPort, owner)
      } catch (error) {
        fileLog(dshHome, `shared registry register failed: ${String(error)}`)
      }
    }
    serverStart = (async () => {
      if (shared) {
        // 会合探测：固定端口上已有 dshui 服务器（另一窗口启动的）→ 直接采纳，
        // 注册自己的工作区（host 插件会经 marker 登记）并以普通用户身份加入。
        if (await probeDshuiServer(port)) {
          server = DshServer.attach(port, workspacePath)
          writeWorkspaceMarker(dshHome, workspacePath)
          await registerUse(port, false)
          notifyReady(port)
          return port
        }
      }
      server = new DshServer({
        cwd: workspacePath,
        dshHome,
        patchPath,
        cliPath,
        port,
        onReady: notifyReady,
        onExit: (code, signal) => {
          console.warn(`[dshui] dsh web exited (code ${String(code)}, signal ${String(signal)})`)
          fileLog(dshHome, `server exited (code ${String(code)}, signal ${String(signal)})`)
        },
        env: {
          ...(openBridge.running ? { DSHUI_OPEN_ENDPOINT: openBridge.endpoint } : {}),
          // 桥不可用时的回退：应用内 `code` CLI 绝对路径（补丁的 dshuiOpenViaCli 使用）。
          DSHUI_CODE_CLI: codeCli,
          // 各窗口桥的注册表（补丁的 dshuiPickBridgeForPath 按工作区前缀路由）。
          DSHUI_BRIDGES_FILE: bridgesPath(dshHome),
        },
      })
      server.onOutput((line) => {
        console.log(`[dshui:server] ${line}`)
        fileLog(dshHome, `server: ${line}`)
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

  /** Point a view's iframe at the server URL for the given scope. The URL also
   *  carries the current VS Code color scheme (`dshui_theme`) so the embedded
   *  SPA boots with the right palette before any relayed message arrives. */
  function makeUrl(workspacePath: string, port: number): string {
    return `http://127.0.0.1:${port}/?dshui_workspace=${encodeURIComponent(workspacePath)}&dshui_theme=${activeColorScheme()}`
  }

  /** Point a view's iframe at the server URL for the given scope. */
  function navigate(webview: vscode.Webview, workspacePath: string, port: number): void {
    void webview.postMessage({ type: 'navigate', url: makeUrl(workspacePath, port) })
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
          const data = message as { type?: unknown; sessionId?: unknown; cwd?: unknown; url?: unknown } | null
          if (data === null || typeof data !== 'object' || typeof data.type !== 'string') return
          // External link clicked in a message: open in the system browser.
          if (data.type === 'openExternal' && typeof data.url === 'string' && data.url !== '') {
            void vscode.env.openExternal(vscode.Uri.parse(data.url))
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
          webviewView.webview.html = panelHtml(makeUrl(workspacePath, runningServer.port))
          return
        }
        webviewView.webview.html = panelHtml()
        void startServer(workspacePath).then((port) => {
          if (currentView === webviewView) navigate(webviewView.webview, workspacePath, port)
        }).catch((error) => {
          console.error('[dshui] failed to start dsh web:', error)
          fileLog(dshHome, `server start failed: ${String(error)}`)
          void vscode.window.showErrorMessage(`dshui: failed to start the dsh server: ${String(error)}`)
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
      const url = `http://127.0.0.1:${port}/?dshui_workspace=${encodeURIComponent(workspacePath)}`
      void vscode.env.openExternal(vscode.Uri.parse(url))
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
        console.error('[dshui] failed to start dsh web:', error)
        fileLog(dshHome, `server start failed: ${String(error)}`)
        void vscode.window.showErrorMessage(`dshui: 启动 dsh server 失败: ${String(error)}`)
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
      console.error('[dshui] dsh server restart failed:', error)
      fileLog(dshHome, `server restart failed: ${String(error)}`)
      void vscode.window.showErrorMessage(`dshui: 重启 dsh server 失败: ${String(error)}`)
    }
  }

  // Command: restart the embedded dsh server (Command Palette only — no
  // view/title button, to avoid accidental clicks).
  context.subscriptions.push(
    vscode.commands.registerCommand('dshui.restartServer', () => {
      void restartServer()
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

  // Command: reference a file (explorer/editor context menu) into the dsh
  // composer — the agent reads the file itself with its own tools.
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
      const payload = buildFileReference(target.fsPath, workspacePath)
      await deliverReference(payload)
      vscode.window.setStatusBarMessage(`dsh UI: 已引用 ${payload.path}`, 3000)
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
        void registerBridge(dshHome, workspacePath, openBridge.endpoint).catch((error) => {
          fileLog(dshHome, `bridge registration failed: ${String(error)}`)
        })
      }
      void startServer(workspacePath)
    }),
  )

  context.subscriptions.push({
    dispose: () => {
      // 共享后端：采纳的服务器不归本窗口管；自己启动的服务器只在没有其他
      // 存活用户时才停掉（其余情况由 detached 服务器自检退出）。注册表条目
      // 尽力摘除——即使没跑完，服务器自检也会把死 pid 当不存在。
      if (server !== null) {
        if (!server.shared && !hasOtherLiveUsers(dshHome)) {
          void server.stop()
        }
        server = null
      }
      void unregisterServerUser(dshHome).catch(() => { /* best-effort */ })
      void unregisterBridge(dshHome).catch(() => { /* best-effort */ })
      openBridge.dispose()
    },
  })

  // Auto-open the sidebar view at startup when a folder is open (unless disabled).
  const autoOpen = vscode.workspace.getConfiguration('dshui').get<boolean>('autoOpen') ?? true
  if (autoOpen) {
    const workspacePath = currentWorkspace()
    if (workspacePath !== undefined) {
      // Pre-warm the dsh server now so the view (focused below) finds it
      // already bound — the iframe boots straight into the SPA instead of
      // sitting on a blank page while the server starts.
      void startServer(workspacePath).catch((error) => {
        console.error('[dshui] pre-warm server start failed:', error)
      })
      void vscode.commands.executeCommand(`${VIEW_ID}.focus`)
    }
  }
}

export function deactivate(): void {
  // dshui plugin packages are left in place (idempotent reinstall on next
  // activation; another window may still be using them).
}
