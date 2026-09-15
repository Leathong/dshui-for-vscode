/**
 * Manages the embedded `dsh --profile web` child process for the current
 * VS Code workspace. The server boots with its working directory set to the
 * opened folder (that directory IS the dsh workspace), on a port passed
 * through the `--port` flag; the actual bound port is read back from the
 * `dsh web: http://127.0.0.1:<port>` URL line dsh prints once it binds.
 *
 * Shared-backend mode: with a fixed port, several windows may use ONE server.
 * A window can `attach()` to a server another window spawned (detected by
 * probing the port); a spawn that loses a fixed-port race adopts the winner
 * instead of failing; and the child is detached so it survives its spawning
 * window and keeps serving the other windows until the last one closes.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { logger } from './logger'

export interface DshServerOptions {
  /** Absolute path of the folder opened in VS Code (the dsh workspace root). */
  cwd: string
  /** Absolute path of the dsh home (defaults to `~/.dsh`). */
  dshHome: string
  /** Absolute path of the cordis overlay patch (`--patch`). */
  patchPath: string
  /** Absolute path of the dsh CLI entry (`@deepseek-ai/dsh/lib/bin.js`). */
  cliPath: string
  /** Desired port; 0 lets the OS pick one. */
  port: number
  /** Called once with the bound port. May fire again after a restart. */
  onReady: (port: number) => void
  /** Called on process exit (restart handled internally). */
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void
  /** Optional extra environment variables. */
  env?: Record<string, string>
  /** True when this server participates in the shared lifecycle registry. */
  sharedBackend?: boolean
}

/**
 * The `dsh web:` readiness line. Since dsh 0.1.2 the root URL carries a
 * process launch token (`/?token=...`) that the browser exchanges for a signed
 * cookie; the embedded webview must load that token URL or the index 401s.
 * Capture the full 127.0.0.1 authority URL (with its token) and derive both
 * the bound port and the token from it.
 */
const URL_LINE = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+[^\s)]*)/

/** Read the bound port and the process launch token from the readiness URL. */
interface BootUrl {
  port: number
  token: string
}

/** Short delay between probe retries (waiting for a just-started server). */
function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Single probe attempt: is a dshui server with a parseable graph on the port? */
function probeDshuiServerOnce(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: timeoutMs }, (res) => {
      res.setEncoding('utf8')
      let body = ''
      res.on('data', (chunk: string) => { body += chunk })
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(body.includes('__DSHUI_WORKSPACE__') && body.includes('"batches":['))
          return
        }
        // Since dsh 0.1.2 the index is behind browser-token auth: a token-less
        // request to `/` answers 401 with this exact body. A dsh web server IS
        // on the port (it just needs the launch token to serve the index), so a
        // raw probe must treat this as "server present" too — otherwise the
        // second window cannot detect the first window's server and spawns a
        // competing child (EADDRINUSE). alpha.4 servers that demand auth always
        // carry a valid graph, so this does not re-open the stale-server hole.
        if (res.statusCode === 401 && body.includes('dsh web authentication required')) {
          resolve(true)
          return
        }
        resolve(false)
      })
    })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => { resolve(false) })
  })
}

/**
 * True when a dshui-managed dsh web server is already serving on the port:
 * the index page carries the injected `__DSHUI_WORKSPACE__` marker, so a
 * random non-dsh process occupying the port is not mistaken for one. The
 * served `__DSH_BOOT__` boot manifest is also validated (its `batches` must be
 * an array) so the probe rejects an incompatible/stale dsh server (e.g. one
 * left running by an older rc.2 session on the shared port) whose graph the
 * current client-modules parser cannot consume — otherwise the extension would
 * attach to it and the SPA would fail with "boot manifest batches must be an
 * array".
 *
 * The probe retries briefly so a server that is only just finishing boot
 * (e.g. the owning window started it a moment earlier in a multi-window race)
 * is detected instead of being mistaken for "no server", which would make the
 * second window spawn a competing child and fail with EADDRINUSE.
 */
export async function probeDshuiServer(port: number, timeoutMs = 1500, attempts = 4): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await probeDshuiServerOnce(port, timeoutMs)) return true
    if (attempt < attempts - 1) await sleepMs(350)
  }
  return false
}

/**
 * True when the port serves a dshui-managed index page (carries the injected
 * `__DSHUI_WORKSPACE__` marker), regardless of whether its client graph is
 * current. Used to identify a stale/incompatible dsh server on a shared port
 * so the extension can reclaim it (kill and re-spawn) instead of attaching to
 * a server whose boot manifest the current client-modules cannot parse.
 */
export function probeDshuiMarker(port: number, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        resolve(false)
        return
      }
      res.setEncoding('utf8')
      let body = ''
      res.on('data', (chunk: string) => { body += chunk })
      res.on('end', () => { resolve(body.includes('__DSHUI_WORKSPACE__')) })
    })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => { resolve(false) })
  })
}

/** Maximum automatic restarts before the server stays down. */
const MAX_RESTARTS = 2

/** Wait for a line matching the URL pattern on the child's stdout. */
function waitForUrl(child: ChildProcess, timeoutMs: number): Promise<BootUrl> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`dsh web did not print its URL within ${timeoutMs}ms`))
    }, timeoutMs)
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8')
      const match = URL_LINE.exec(buffer)
      if (match === null) return
      const url = new URL(match[1])
      const port = Number(url.port)
      const token = url.searchParams.get('token') ?? ''
      cleanup()
      resolve({ port, token })
    }
    const onExit = (code: number | null): void => {
      cleanup()
      reject(new Error(`dsh web exited before binding (code ${String(code)})`))
    }
    const cleanup = (): void => {
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.off('exit', onExit)
    }
    child.stdout?.on('data', onData)
    child.on('exit', onExit)
  })
}

export class DshServer {
  private child: ChildProcess | null = null
  private stopping = false
  private boundPort: number | undefined
  private restarts = 0
  private readonly options: DshServerOptions
  private onData: ((line: string) => void) | null = null
  private startDiagnostics = ''
  /** The dsh launch token for the bound server (empty when attached via probe). */
  private launchToken = ''

  constructor(options: DshServerOptions) {
    this.options = options
  }

  /**
   * Attach to an already-running dshui server on the port (spawned by another
   * window). No child process is owned: `stop()` is a no-op and the server
   * keeps serving other windows.
   * @param port - the shared server's port.
   * @param cwd - this window's workspace root (used for the reuse check).
   * @returns an attached server handle.
   */
  static attach(port: number, cwd: string): DshServer {
    const server = new DshServer({
      cwd, dshHome: '', patchPath: '', cliPath: '', port,
      onReady: () => {}, onExit: () => {},
      sharedBackend: true,
    })
    server.boundPort = port
    return server
  }

  get port(): number | undefined {
    return this.boundPort
  }

  /** The dsh launch token the server prints on its readiness URL. */
  get launchTokenValue(): string {
    return this.launchToken
  }

  /** The port requested at construction (0 means OS-assigned). */
  get requestedPort(): number {
    return this.options.port
  }

  /** The workspace root this server was booted for. */
  get cwd(): string {
    return this.options.cwd
  }

  /** True when this handle participates in the shared lifecycle registry. */
  get lifecycleShared(): boolean {
    return this.options.sharedBackend === true
  }

  /** True when this handle adopted another window's server (no child owned). */
  get shared(): boolean {
    return this.child === null && this.boundPort !== undefined
  }

  /**
   * True when `stop()` was requested for this handle, so its child's exit is
   * intentional (window reload, explicit restart) and must not be treated as
   * an unexpected exit by the extension's recovery path. Cleared again when a
   * restarted child is spawned.
   */
  get stoppingRequested(): boolean {
    return this.stopping
  }

  /** Subscribe to the child's stdout lines (diagnostics). */
  onOutput(listener: (line: string) => void): void {
    this.onData = listener
  }

  /** Boot the server (or restart it after a crash); resolve with the bound port. */
  start(): Promise<number> {
    if (this.boundPort !== undefined && (this.child === null || this.child.exitCode === null)) {
      return Promise.resolve(this.boundPort)
    }
    return this.spawn(this.options.port)
  }

  private spawn(requestedPort: number): Promise<number> {
    this.stopping = false
    const args = [
      // dsh's HMR service and bare-name plugin resolution need the Node
      // internal module loader, which requires this flag.
      '--expose-internals',
      this.options.cliPath,
      '--profile', 'web',
      '--patch', this.options.patchPath,
      '--port', String(requestedPort),
      // dsh rc.1+ opens the default browser after the web tree settles; the
      // embedded server must never hand off to the OS browser.
      '--no-open',
    ]
    const child = spawn(process.execPath, args, {
      cwd: this.options.cwd,
      // Detached: the server must survive its spawning window (a shared
      // backend outlives the owner while other windows still use it). The
      // host plugin self-exits once the lifecycle registry has no live users.
      detached: true,
      env: {
        ...process.env,
        // In the VS Code extension host `process.execPath` is the Electron
        // binary; this flag makes it run the CLI script as plain Node.
        ELECTRON_RUN_AS_NODE: '1',
        DSH_HOME: this.options.dshHome,
        ...this.options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // Unref so the extension host never waits on the server at exit; the
    // stdout pipe keeps the URL-read listener alive while this host lives.
    child.unref()
    this.child = child
    this.startDiagnostics = ''
    const rememberDiagnostic = (chunk: Buffer): void => {
      this.startDiagnostics = `${this.startDiagnostics}${chunk.toString('utf8')}`.slice(-16_384)
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      rememberDiagnostic(chunk)
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line.trim() !== '' && this.onData !== null) this.onData(line)
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      rememberDiagnostic(chunk)
      if (this.onData !== null) this.onData(chunk.toString('utf8'))
    })

    return waitForUrl(child, 60_000).then((boot) => {
      this.boundPort = boot.port
      this.launchToken = boot.token
      child.on('exit', (code, signal) => {
        this.child = null
        this.boundPort = undefined
        this.options.onExit?.(code, signal)
        if (this.stopping) return
        // Unexpected exit: retry on the configured port, never a random
        // fallback. A fixed port that is occupied will surface the same
        // "change dshui.server.port" error as the initial spawn.
        if (code !== 0 && this.restarts < MAX_RESTARTS) {
          this.restarts += 1
          this.spawn(this.options.port).then(this.options.onReady).catch((error) => {
            this.options.onExit?.(null, null)
            logger.error('[dshui] dsh web restart failed:', error)
          })
        }
      })
      return boot.port
    }).catch(async (error) => {
      if (this.child !== null && this.child.exitCode === null) {
        // Never bound and still alive: kill before any retry/adoption.
        try { child.kill('SIGTERM') } catch { /* already gone */ }
      }
      // Fixed-port spawn race: another window's dshui server may now hold the
      // port (this child exited with EADDRINUSE). Adopt the winner instead of
      // failing; this is still the same configured port and the same shared
      // backend, not a fallback.
      if (requestedPort !== 0 && await probeDshuiServer(requestedPort)) {
        this.child = null
        this.boundPort = requestedPort
        return requestedPort
      }
      if (requestedPort !== 0) {
        const cause = error instanceof Error ? error.message : String(error)
        // Only claim "port occupied" when the child actually reported a bind
        // failure. Any other boot error (plugin load failure, bad patch, ...)
        // must not send the user on a wild-goose chase after lsof.
        if (/EADDRINUSE|address already in use/i.test(this.startDiagnostics)) {
          throw new Error(
            `dsh web failed to bind configured port ${requestedPort}: ${cause}. `
            + 'The port is occupied. Please change "dshui.server.port" '
            + 'in VS Code settings, then run the "dshui: Restart dsh Server" command.',
          )
        }
        const summary = this.startDiagnostics.split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line.startsWith('Error:') || line.includes('ERR_MODULE_NOT_FOUND'))
        const detail = summary === undefined ? '' : ` — ${summary.slice(0, 240)}`
        throw new Error(
          `dsh web failed to start: ${cause}${detail}. `
          + 'See the "dsh UI" output channel (View → Output → dsh UI, or run the '
          + '"dshui: Show Logs" command) or '
          + `${path.join(this.options.dshHome, 'dshui-logs', 'extension.log')} for the server output.`,
        )
      }
      throw error
    })
  }

  /** Stop the child process. */
  async stop(): Promise<void> {
    this.stopping = true
    const child = this.child
    this.child = null
    if (child === null || child.exitCode !== null) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL') } catch { /* already gone */ }
      }, 5000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      try { child.kill('SIGTERM') } catch { /* already gone */ }
    })
  }

  /** True when the server is bound and usable (owned child alive, or adopted). */
  get running(): boolean {
    return this.boundPort !== undefined && (this.child === null || this.child.exitCode === null)
  }
}

/** Resolve the bundled dsh CLI entry inside the extension. */
export function bundledCliPath(extensionPath: string): string {
  const candidates = [
    path.join(extensionPath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(
    'dshui: could not locate the bundled @deepseek-ai/dsh CLI. '
    + 'Run `npm install` in the extension directory.',
  )
}
