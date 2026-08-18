/**
 * Logging for the dshui extension.
 *
 * Every log line goes to three sinks, so problems can be diagnosed either
 * from the IDE itself or from the filesystem:
 *
 * 1. The "dsh UI" VS Code Output channel (View → Output → dsh UI) — the
 *    primary sink. The `dshui.showLogs` command reveals it; error
 *    notifications offer a "View Logs" action that opens it too.
 * 2. The extension-host console, mirrored with the same text (plus a
 *    `[dshui]` tag) — the extension host console is not observable from the
 *    CLI, so this is only a convenience during development.
 * 3. `$DSH_HOME/dshui-logs/extension.log` — appended once `setLogFile` has
 *    been called (the dsh home is resolved during activation). This is what
 *    headless verification reads and what the dsh-server error hints point
 *    at, so the format deliberately keeps one line per entry with an ISO
 *    timestamp prefix.
 *
 * Logging never throws: a broken sink must never break extension activation.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'

type Level = 'INFO' | 'WARN' | 'ERROR'

const CHANNEL_NAME = 'dsh UI'

let channel: vscode.OutputChannel | null = null
let fileTarget: string | null = null

function getChannel(): vscode.OutputChannel {
  if (channel === null) channel = vscode.window.createOutputChannel(CHANNEL_NAME)
  return channel
}

/**
 * Route the file sink to `file` (absolute path). Call once the dsh home is
 * known, so everything logged after activation is persisted too. The parent
 * directory is created on demand; failures are swallowed (logging only).
 */
export function setLogFile(file: string): void {
  fileTarget = file
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  } catch {
    // logging must never break activation
  }
}

/** Format one log argument: Errors expand to their stack, everything else to text. */
function formatArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? String(arg)
  if (typeof arg === 'string') return arg
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function emit(level: Level, args: unknown[]): void {
  if (args.length === 0) return
  const line = `[${new Date().toISOString()}] [${level}] ${args.map(formatArg).join(' ')}`
  try {
    getChannel().appendLine(line)
  } catch {
    // logging must never break activation
  }
  const mirror = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log
  try {
    mirror(`[dshui] ${line}`)
  } catch {
    // logging must never break activation
  }
  if (fileTarget !== null) {
    try {
      fs.appendFileSync(fileTarget, `${line}\n`)
    } catch {
      // logging must never break activation
    }
  }
}

export const logger = {
  info(...args: unknown[]): void {
    emit('INFO', args)
  },
  warn(...args: unknown[]): void {
    emit('WARN', args)
  },
  error(...args: unknown[]): void {
    emit('ERROR', args)
  },
  /** Reveal the "dsh UI" output channel without stealing focus. */
  show(): void {
    getChannel().show(true)
  },
  /** Dispose the output channel (extension deactivation). */
  dispose(): void {
    if (channel !== null) {
      channel.dispose()
      channel = null
    }
    fileTarget = null
  },
}

/**
 * Log uncaught exceptions and unhandled promise rejections to the output
 * channel so crashes inside the extension host leave a trace. The extension
 * host registers its own listeners too, so the user still gets VS Code's
 * error dialog; this handler only records the detail (it deliberately does
 * not rethrow, which would double-report and could terminate the host).
 *
 * The extension host is a single Node process SHARED by every extension, so a
 * plain `process.on('unhandledRejection')` also captures other extensions'
 * rejections and mislabels them as `[dshui]` — e.g. VS Code's built-in Git
 * extension rejects with "Error: Git error" whenever a git command exits
 * non-zero, flooding the dsh UI output channel with noise that looks like
 * this plugin is broken. Only errors whose stack references this extension's
 * own files (`extensionRoot`) are recorded; everything else is left to the
 * extension that produced it.
 */
export function installCrashHandlers(extensionRoot: string): void {
  const owns = (reason: unknown): boolean => {
    if (reason instanceof Error && typeof reason.stack === 'string') {
      return reason.stack.includes(extensionRoot)
    }
    // Non-Error reasons carry no stack to attribute — rare, keep the trace
    // (other extensions' real failures are Error objects with their own
    // stacks, so they are filtered out above).
    return true
  }
  process.on('uncaughtException', (error) => {
    if (owns(error)) logger.error('[dshui] uncaught exception:', error)
  })
  process.on('unhandledRejection', (reason) => {
    if (owns(reason)) logger.error('[dshui] unhandled promise rejection:', reason)
  })
}
