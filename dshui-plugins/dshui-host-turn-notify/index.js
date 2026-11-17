/**
 * dshui host plugin: publishes turn boundaries to the VS Code extension that
 * embeds this dsh server.
 *
 * The extension host cannot observe dsh's in-process `session/event` stream and
 * the embedded page cannot raise VS Code notifications, so the dsh home carries
 * the feed: after every completed or failed top-level turn this plugin
 * rewrites `$DSH_HOME/dshui-turn-events-<port>.json` with the most recent
 * boundaries, and `src/turnNotifier.ts` in the extension polls that file.
 *
 * One file per bound port keeps concurrent (non-shared) servers apart, and
 * `runId` lets the extension tell a restarted server's fresh feed from the
 * previous run's. Writes go through temp+rename so a poll never reads a
 * half-written payload.
 */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export const name = 'dshui-host-turn-notify'

/** Required services: the bound HTTP server (its port names the feed file). */
export const inject = ['webServer']

/** Feed schema version; the extension's parser rejects anything else. */
const FEED_VERSION = 1

/** Keep this many boundaries in the feed; only recent ones are notifiable. */
const MAX_EVENTS = 20

/**
 * Resolve the dsh home the same way dsh itself does.
 * @param env - environment to read `DSH_HOME` from.
 * @returns the absolute dsh home directory.
 */
function resolveDshHome(env = process.env) {
  const configured = env.DSH_HOME
  if (typeof configured === 'string' && configured !== '') return configured
  return path.join(os.homedir(), '.dsh')
}

/**
 * Publish completed and failed turn boundaries to the embedding extension.
 * @param ctx - host Cordis context.
 */
export function apply(ctx) {
  const dshHome = resolveDshHome()
  const runId = randomUUID()
  // Mount evidence: the extension polls this home, so a boot log naming it tells
  // a missing/pending row from a running one when the feed never appears.
  ctx.logger?.info(`dshui-host-turn-notify: publishing turn boundaries to ${dshHome}`)
  /** @type {{ seq: number, sessionId: string, cwd: string, turn: number, reason: string, endedAt: number }[]} */
  const events = []
  let seq = 0
  let warned = false

  const publish = () => {
    const port = ctx.webServer.port
    if (port === undefined) return
    const target = path.join(dshHome, `dshui-turn-events-${String(port)}.json`)
    const temporary = `${target}.tmp`
    try {
      fs.mkdirSync(dshHome, { recursive: true })
      fs.writeFileSync(temporary, JSON.stringify({ version: FEED_VERSION, runId, events }))
      fs.renameSync(temporary, target)
    } catch (error) {
      // Best effort: a failed publish must never fail the turn itself.
      if (!warned) {
        warned = true
        ctx.logger?.warn(`dshui-host-turn-notify: cannot publish ${target}: ${String(error)}`)
      }
    }
  }

  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    const header = session.header
    // Delegated subagents finish constantly; only top-level turns interest the user.
    if (header?.origin === 'subagent') return
    const cwd = header?.cwd
    if (typeof cwd !== 'string' || cwd === '') return
    const data = event.data
    seq += 1
    events.push({
      seq,
      sessionId: String(session.id),
      cwd,
      turn: typeof data?.turn === 'number' ? data.turn : 0,
      reason: typeof data?.reason?.kind === 'string' ? data.reason.kind : 'unknown',
      endedAt: Date.now(),
    })
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
    publish()
  })
}
