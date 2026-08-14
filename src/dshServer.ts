/**
 * Manages the embedded `dsh --profile web` child process for the current
 * VS Code workspace. The server boots with its working directory set to the
 * opened folder (that directory IS the dsh workspace), on a port passed
 * through the `--port` flag; the actual bound port is read back from the
 * `dsh web: http://127.0.0.1:<port>` URL line dsh prints once it binds.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

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
}

const URL_LINE = /dsh web:\s+http:\/\/127\.0\.0\.1:(\d+)/

/** Maximum automatic restarts before the server stays down. */
const MAX_RESTARTS = 2

/** Wait for a line matching the URL pattern on the child's stdout. */
function waitForUrl(child: ChildProcess, timeoutMs: number): Promise<number> {
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
      const port = Number(match[1])
      cleanup()
      resolve(port)
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

  constructor(options: DshServerOptions) {
    this.options = options
  }

  get port(): number | undefined {
    return this.boundPort
  }

  /** The workspace root this server was booted for. */
  get cwd(): string {
    return this.options.cwd
  }

  /** Subscribe to the child's stdout lines (diagnostics). */
  onOutput(listener: (line: string) => void): void {
    this.onData = listener
  }

  /** Boot the server (or restart it after a crash). */
  start(): Promise<number> {
    if (this.child !== null && this.boundPort !== undefined) return Promise.resolve(this.boundPort)
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
    ]
    const child = spawn(process.execPath, args, {
      cwd: this.options.cwd,
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
    this.child = child
    child.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line.trim() !== '' && this.onData !== null) this.onData(line)
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (this.onData !== null) this.onData(chunk.toString('utf8'))
    })

    return waitForUrl(child, 60_000).then((port) => {
      this.boundPort = port
      child.on('exit', (code, signal) => {
        this.child = null
        this.boundPort = undefined
        this.options.onExit?.(code, signal)
        if (this.stopping) return
        // Unexpected exit: restart on an OS-picked port, at most twice, so a
        // persistently crashing server cannot loop forever.
        if (code !== 0 && this.restarts < MAX_RESTARTS) {
          this.restarts += 1
          this.spawn(0).then(this.options.onReady).catch((error) => {
            this.options.onExit?.(null, null)
            console.error('[dshui] dsh web restart failed:', error)
          })
        }
      })
      return port
    }).catch(async (error) => {
      if (this.child !== null && this.child.exitCode === null) {
        // Never bound; likely a port conflict. Kill and retry on port 0.
        try { child.kill('SIGTERM') } catch { /* already gone */ }
        if (requestedPort !== 0 && this.restarts < MAX_RESTARTS) {
          this.restarts += 1
          return this.spawn(0).then((port) => {
            this.boundPort = port
            return port
          })
        }
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

  /** True when the child process is alive and bound. */
  get running(): boolean {
    return this.child !== null && this.child.exitCode === null && this.boundPort !== undefined
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
