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
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import { logger } from './logger'

/**
 * Minimum Node.js version the bundled dsh CLI runs on. Mirrors the extension
 * host floor (`MIN_NODE` in extension.ts): dsh ≥ rc7 needs Node ≥ 22.19 for
 * `module.registerHooks` and the modern ESM loader internals.
 */
export const MIN_DSH_NODE = '22.19.0'

/**
 * How the dsh CLI child process is launched.
 *
 * `'node'` is a real Node.js binary and is strongly preferred: since dsh
 * 0.1.6 the boot sequence reads Node/V8 internals through the native
 * `node-addon-require-builtin` addon, which cannot initialize inside VS Code's
 * Electron process (the V8 symbol/embedder probe fails with
 * `Unsupported/no-realm`, and the adhoc-signed prebuild can also be rejected by
 * macOS library validation). `'electron'` is the historical
 * `process.execPath` + `ELECTRON_RUN_AS_NODE=1` launch, kept as the last-resort
 * fallback for hosts without a usable system Node (it still serves dsh ≤ 0.1.5).
 */
export interface DshRuntime {
  /** Launch mode. */
  kind: 'node' | 'electron'
  /** Executable to spawn. */
  command: string
  /** Absolute path of the external Node.js binary (`kind === 'node'`). */
  nodePath?: string
  /** Version reported by `<node> --version`. */
  version?: string
}

/** Compare two `X.Y.Z` version strings (`0` when equal; unparsable parts count as 0). */
function compareNodeVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value.trim().replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10))
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Parse the `vX.Y.Z` a `node --version` run prints. */
function parseNodeVersion(text: string): string | undefined {
  return /v(\d+\.\d+\.\d+)/.exec(text)?.[1]
}

/** `readdirSync` that answers `[]` instead of throwing (missing/denied root). */
function readDirNames(dir: string): string[] {
  try { return fs.readdirSync(dir) } catch { return [] }
}

/**
 * Probe one candidate binary: it must be a regular file whose `--version`
 * reports a Node.js new enough for the bundled CLI.
 * @param candidate - absolute path of a possible `node` executable.
 * @returns the reported version, or undefined when the candidate is unusable.
 */
function probeNodeBinary(candidate: string): string | undefined {
  try {
    if (!fs.statSync(candidate).isFile()) return undefined
  } catch {
    return undefined
  }
  const result = spawnSync(candidate, ['--version'], {
    encoding: 'utf8',
    // `node --version` is instant; a candidate that hangs (broken shim) must
    // not stall server startup.
    timeout: 3_000,
    windowsHide: true,
  })
  if (result.error !== undefined && result.error !== null) return undefined
  if (result.status !== 0) return undefined
  const version = parseNodeVersion(`${result.stdout ?? ''}${result.stderr ?? ''}`)
  if (version === undefined) return undefined
  return compareNodeVersions(version, MIN_DSH_NODE) >= 0 ? version : undefined
}

/**
 * Candidate `node` binaries, PATH first and then the usual install roots: a
 * GUI-launched VS Code inherits launchd's minimal PATH, so Homebrew/nvm/fnm
 * installs are invisible without the explicit list.
 */
function nodeCandidates(): string[] {
  const names = process.platform === 'win32' ? ['node.exe', 'node.cmd', 'node'] : ['node']
  const candidates: string[] = []
  const seen = new Set<string>()
  const push = (value: string): void => {
    const key = process.platform === 'win32' ? value.toLowerCase() : value
    if (key !== '' && !seen.has(key)) {
      seen.add(key)
      candidates.push(value)
    }
  }
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (dir === '') continue
    for (const name of names) push(path.join(dir, name))
  }
  const home = os.homedir()
  if (process.platform === 'win32') {
    for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]) {
      if (root !== undefined && root !== '') push(path.join(root, 'nodejs', 'node.exe'))
    }
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData !== undefined && localAppData !== '') {
      push(path.join(localAppData, 'Volta', 'bin', 'node.exe'))
      push(path.join(localAppData, 'fnm_multishells', 'node.exe'))
    }
  } else {
    const bin = (dir: string): void => push(path.join(dir, 'node'))
    for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin', '/bin']) bin(dir)
    bin(path.join(home, '.volta', 'bin'))
    bin(path.join(home, '.local', 'bin'))
    bin(path.join(home, '.asdf', 'shims'))
  }
  // Version managers keep one directory per installed version: scan newest first.
  const versionRoots: Array<[string, string]> = [
    [path.join(home, '.nvm', 'versions', 'node'), path.join('bin', 'node')],
    [path.join(home, '.fnm', 'node-versions'), path.join('installation', 'bin', 'node')],
    [path.join(home, 'Library', 'Application Support', 'fnm', 'node-versions'), path.join('installation', 'bin', 'node')],
    [path.join(home, '.local', 'share', 'fnm', 'node-versions'), path.join('installation', 'bin', 'node')],
    [path.join(home, '.asdf', 'installs', 'nodejs'), path.join('bin', 'node')],
  ]
  for (const [root, suffix] of versionRoots) {
    const entries = readDirNames(root).sort((a, b) => compareNodeVersions(b, a))
    for (const entry of entries) push(path.join(root, entry, suffix))
  }
  return candidates
}

/** The last-resort launch: VS Code's Electron binary acting as Node. */
function electronRuntime(): DshRuntime {
  return { kind: 'electron', command: process.execPath, version: process.versions.node }
}

/** Requested `dshui.server.nodePath` values that mean "detect a system Node.js". */
const AUTO_RUNTIME = new Set(['', 'auto', 'system', 'path'])

/** Requested `dshui.server.nodePath` values that mean "always use Electron". */
const ELECTRON_RUNTIME = new Set(['electron', 'builtin', 'embedded', 'vscode'])

/** Successful resolutions, keyed by the requested setting value. */
const runtimeCache = new Map<string, DshRuntime>()

/**
 * Resolve the runtime that launches the dsh CLI.
 *
 * dsh ≥ 0.1.6 loads `node-addon-require-builtin` during host preparation and
 * dies with `Unsupported/no-realm` when that addon runs inside VS Code's
 * Electron process, so a real Node.js binary is used whenever one is found.
 * The Electron launch is kept as a last resort because it still serves dsh
 * ≤ 0.1.5 hosts that have no system Node installed.
 *
 * A failed detection is deliberately not cached: installing Node.js (or fixing
 * the configured path) and running "dshui: Restart dsh Server" then takes
 * effect without reloading the window.
 *
 * @param requested - the `dshui.server.nodePath` setting: empty/`auto`
 * (detect), `electron` (force the embedded runtime), or a binary path.
 * @returns the runtime to spawn.
 */
export function resolveDshRuntime(requested = ''): DshRuntime {
  const value = requested.trim()
  const key = value.toLowerCase()
  const cached = runtimeCache.get(key)
  if (cached !== undefined) return cached
  if (ELECTRON_RUNTIME.has(key)) return electronRuntime()
  if (!AUTO_RUNTIME.has(key)) {
    const version = probeNodeBinary(value)
    if (version !== undefined) {
      const runtime: DshRuntime = { kind: 'node', command: value, nodePath: value, version }
      runtimeCache.set(key, runtime)
      return runtime
    }
    logger.error(
      `[dshui] dshui.server.nodePath="${value}" is not a usable Node.js >= ${MIN_DSH_NODE} binary; falling back to auto-detection`,
    )
  }
  for (const candidate of nodeCandidates()) {
    const version = probeNodeBinary(candidate)
    if (version === undefined) continue
    const runtime: DshRuntime = { kind: 'node', command: candidate, nodePath: candidate, version }
    runtimeCache.set(key, runtime)
    return runtime
  }
  logger.warn(
    `[dshui] no system Node.js >= ${MIN_DSH_NODE} found; launching dsh with VS Code's embedded Electron runtime. `
    + 'dsh 0.1.6+ cannot boot there (its native addon "node-addon-require-builtin" is unsupported): '
    + 'install Node.js or set "dshui.server.nodePath", then run "dshui: Restart dsh Server".',
  )
  return electronRuntime()
}

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
  /** `dshui.server.nodePath`: a Node.js ≥ 22.19 binary, `electron`, or empty to auto-detect. */
  nodePath?: string
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
 * Whether the dsh web server listening on `port` accepts one launch token.
 *
 * The root index answers the matching token with a 303 cookie exchange; a
 * token the process does not know is answered with 401, or — when the caller
 * already holds a valid browser cookie — with a bare `./` redirect that drops
 * every query parameter, the `dshui_workspace` scope included. No cookie
 * travels with this probe, so the answer depends on the token alone.
 * @param port - the server's loopback port.
 * @param token - candidate process launch token.
 * @param timeoutMs - per-request timeout.
 * @returns true only when the live server accepts the token.
 */
export function verifyLaunchToken(port: number, token: string, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    if (token === '') {
      resolve(false)
      return
    }
    const req = http.get(
      { host: '127.0.0.1', port, path: `/?token=${encodeURIComponent(token)}`, timeout: timeoutMs },
      (res) => {
        res.resume()
        resolve(res.statusCode === 303)
      },
    )
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
    const runtime = resolveDshRuntime(this.options.nodePath)
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
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DSH_HOME: this.options.dshHome,
      ...this.options.env,
    }
    // Electron-only switch: inherited by the extension host's children, but a
    // real Node.js binary rejects it.
    delete env.ELECTRON_RUN_AS_NODE
    if (runtime.kind === 'electron') {
      // In the VS Code extension host `process.execPath` is the Electron
      // binary; this flag makes it run the CLI script as plain Node.
      env.ELECTRON_RUN_AS_NODE = '1'
      logger.info(
        `[dshui] launching dsh web with VS Code's embedded Node v${process.versions.node} (Electron)`,
      )
    } else {
      logger.info(`[dshui] launching dsh web with system Node.js v${String(runtime.version)} (${String(runtime.nodePath)})`)
    }
    const child = spawn(runtime.command, args, {
      cwd: this.options.cwd,
      // Detached: the server must survive its spawning window (a shared
      // backend outlives the owner while other windows still use it). The
      // host plugin self-exits once the lifecycle registry has no live users.
      detached: true,
      env,
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
      const cause = error instanceof Error ? error.message : String(error)
      // Only claim "port occupied" when the child actually reported a bind
      // failure. Any other boot error (plugin load failure, bad patch, ...)
      // must not send the user on a wild-goose chase after lsof.
      if (requestedPort !== 0 && /EADDRINUSE|address already in use/i.test(this.startDiagnostics)) {
        throw new Error(
          `dsh web failed to bind configured port ${requestedPort}: ${cause}. `
          + 'The port is occupied. Please change "dshui.server.port" '
          + 'in VS Code settings, then run the "dshui: Restart dsh Server" command.',
        )
      }
      const summary = this.startDiagnostics.split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.startsWith('Error:')
          || line.includes('ERR_MODULE_NOT_FOUND')
          || line.includes('host preparation failed'))
      const detail = summary === undefined ? '' : ` — ${summary.slice(0, 240)}`
      // dsh ≥ 0.1.6 loads the native `node-addon-require-builtin` addon during
      // host preparation; it cannot run inside VS Code's Electron process, so
      // when that is what killed the boot, name the one fix that works instead
      // of leaving the raw addon error in the notification. Applies to the
      // OS-assigned-port launch too (dshui.server.port = 0).
      const runtimeHint = /node-addon-require-builtin|host preparation failed/.test(this.startDiagnostics)
        ? ' The bundled dsh needs a real Node.js runtime: install Node.js '
          + `>= ${MIN_DSH_NODE} (or set "dshui.server.nodePath"), then run the `
          + '"dshui: Restart dsh Server" command. VS Code\'s embedded Electron runtime cannot load '
          + "dsh's native addon."
        : ''
      throw new Error(
        `dsh web failed to start: ${cause}${detail}.${runtimeHint} `
        + 'See the "dsh UI" output channel (View → Output → dsh UI, or run the '
        + '"dshui: Show Logs" command) or '
        + `${path.join(this.options.dshHome, 'dshui-logs', 'extension.log')} for the server output.`,
      )
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
