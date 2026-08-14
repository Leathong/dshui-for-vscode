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
import * as path from 'node:path'
import * as vscode from 'vscode'
import { bundledCliPath, DshServer } from './dshServer'
import { OpenBridge } from './openBridge'
import { patchFileOpener } from './openPatch'
import { installPlugins, resolveDshHome, type InstalledPlugin } from './plugins'

const VIEW_ID = 'dshui.view'

/** Minimal file logger for headless verification (the extension host console is not observable from the CLI). */
function fileLog(dshHome: string, message: string): void {
  try {
    const logDir = path.join(dshHome, 'dshui-logs')
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(path.join(logDir, 'extension.log'), `${new Date().toISOString()} ${message}\n`)
  } catch { /* logging must never break activation */ }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const extensionRoot = context.extensionPath
  const pluginsDir = path.join(extensionRoot, 'dshui-plugins')
  const patchPath = path.join(extensionRoot, 'patch.yml')
  const cliPath = bundledCliPath(extensionRoot)
  const dshHome = resolveDshHome()
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
  }

  /** Current workspace root (canonicalized) or undefined. */
  function currentWorkspace(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0]
    if (folder === undefined) return undefined
    const raw = folder.uri.fsPath
    try { return fs.realpathSync(raw) } catch { return raw }
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
    const port = configPort > 0 ? configPort : 0
    server = new DshServer({
      cwd: workspacePath,
      dshHome,
      patchPath,
      cliPath,
      port,
      onReady: (boundPort) => {
        console.log(`[dshui] dsh web ready on port ${boundPort}`)
        fileLog(dshHome, `server ready on port ${boundPort} for ${workspacePath}`)
        serverStart = null
        if (currentView !== null && currentWorkspacePath === workspacePath) {
          navigate(currentView.webview, workspacePath, boundPort)
        }
      },
      onExit: (code, signal) => {
        console.warn(`[dshui] dsh web exited (code ${String(code)}, signal ${String(signal)})`)
        fileLog(dshHome, `server exited (code ${String(code)}, signal ${String(signal)})`)
      },
      env: openBridge.running ? { DSHUI_OPEN_ENDPOINT: openBridge.endpoint } : {},
    })
    server.onOutput((line) => {
      console.log(`[dshui:server] ${line}`)
      fileLog(dshHome, `server: ${line}`)
    })
    serverStart = server.start()
    return serverStart
  }

  /** Point a view's iframe at the server URL for the given scope. */
  function makeUrl(workspacePath: string, port: number): string {
    return `http://127.0.0.1:${port}/?dshui_workspace=${encodeURIComponent(workspacePath)}`
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
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'navigate') {
        document.getElementById('frame').src = event.data.url;
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

  // Restart the server and re-navigate when the workspace folder changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const workspacePath = currentWorkspace()
      if (workspacePath === undefined) return
      if (currentView === null || currentWorkspacePath === workspacePath) return
      currentWorkspacePath = workspacePath
      void startServer(workspacePath)
    }),
  )

  context.subscriptions.push({
    dispose: () => {
      if (server !== null) {
        void server.stop()
        server = null
      }
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
