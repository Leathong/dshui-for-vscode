/**
 * Parsing and cursor logic for the turn-completion feed the dsh host plugin
 * (`dshui-plugins/dshui-host-turn-notify`) republishes into the dsh home after
 * every completed or failed top-level turn.
 *
 * The file crosses a process boundary and is replaced by rename while it is
 * read, so every field is validated instead of trusted. This module stays free
 * of the `vscode` API so the cursor rules can run (and be exercised) in plain
 * Node; `turnNotifier.ts` owns the VS Code side.
 */
import * as path from 'node:path'

/** Prefix of the per-server feed file in the dsh home; the bound port is the suffix. */
export const TURN_EVENTS_FILE_PREFIX = 'dshui-turn-events-'

/** Feed schema version the host plugin writes. */
export const TURN_EVENTS_FEED_VERSION = 1

/** One turn boundary as published by the host plugin. */
export interface TurnEventRecord {
  /** Monotonic per-server-run sequence number, starting at 1. */
  readonly seq: number
  readonly sessionId: string
  /** Absolute working directory the session was created in. */
  readonly cwd: string
  readonly turn: number
  /** `TurnEndReason.kind` (`completed`, `error`, `aborted`, …). */
  readonly reason: string
  /** Unix epoch milliseconds when the boundary was published. */
  readonly endedAt: number
}

/** The feed file payload: the server run identity plus its most recent boundaries. */
export interface TurnEventFeed {
  readonly runId: string
  readonly events: readonly TurnEventRecord[]
}

/** How far this window has consumed one server run's feed. */
export interface TurnEventCursor {
  readonly runId: string
  readonly lastSeq: number
}

/** Notification-worthy outcome of a turn boundary. */
export type TurnEventOutcome = 'completed' | 'failed'

/**
 * Absolute path of the feed file one server publishes.
 * @param dshHome - the dsh home directory.
 * @param port - the server's bound HTTP port.
 * @returns the feed file path.
 */
export function turnEventsFilePath(dshHome: string, port: number): string {
  return path.join(dshHome, `${TURN_EVENTS_FILE_PREFIX}${String(port)}.json`)
}

/**
 * Structural test for a JSON object.
 * @param value - decoded JSON value.
 * @returns true for a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse one feed payload, dropping unusable entries.
 * @param text - raw file contents.
 * @returns the validated feed, or undefined when the payload is unusable.
 */
export function parseTurnEventFeed(text: string): TurnEventFeed | undefined {
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isRecord(decoded)) return undefined
  if (decoded.version !== TURN_EVENTS_FEED_VERSION) return undefined
  if (typeof decoded.runId !== 'string' || decoded.runId === '') return undefined
  if (!Array.isArray(decoded.events)) return undefined
  const events: TurnEventRecord[] = []
  for (const entry of decoded.events) {
    if (!isRecord(entry)) continue
    const { seq, sessionId, cwd, turn, reason, endedAt } = entry
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) continue
    if (typeof sessionId !== 'string' || sessionId === '') continue
    if (typeof cwd !== 'string' || cwd === '') continue
    if (typeof turn !== 'number' || !Number.isSafeInteger(turn) || turn < 0) continue
    if (typeof reason !== 'string' || reason === '') continue
    if (typeof endedAt !== 'number' || !Number.isFinite(endedAt)) continue
    events.push({ seq, sessionId, cwd, turn, reason, endedAt })
  }
  return { runId: decoded.runId, events }
}

/** Highest sequence number in a feed payload; 0 for an empty feed. */
export function turnEventMaxSeq(feed: TurnEventFeed): number {
  return feed.events.reduce((max, event) => Math.max(max, event.seq), 0)
}

/**
 * Advance a window's cursor over one feed payload and report the boundaries it
 * has not consumed yet.
 *
 * The first payload a window sees is history (the server may predate the
 * window) and produces no events; a window that found no feed at all seeds its
 * cursor with an empty `runId`, so the first payload to appear afterwards is
 * this window's own and is consumed whole. A changed `runId` means the server
 * restarted and rewrote the file with only the new run's boundaries, so every
 * entry is new. Within one run only entries past the cursor are consumed.
 * @param feed - validated feed payload.
 * @param cursor - this window's previous cursor, if any.
 * @returns the newly consumable boundaries and the updated cursor.
 */
export function advanceTurnEventCursor(
  feed: TurnEventFeed,
  cursor: TurnEventCursor | undefined,
): { events: TurnEventRecord[]; cursor: TurnEventCursor } {
  const maxSeq = turnEventMaxSeq(feed)
  if (cursor === undefined) {
    return { events: [], cursor: { runId: feed.runId, lastSeq: maxSeq } }
  }
  if (cursor.runId !== feed.runId) {
    const fresh = [...feed.events].sort((a, b) => a.seq - b.seq)
    return { events: fresh, cursor: { runId: feed.runId, lastSeq: maxSeq } }
  }
  return {
    events: feed.events.filter((event) => event.seq > cursor.lastSeq),
    cursor: { runId: feed.runId, lastSeq: Math.max(cursor.lastSeq, maxSeq) },
  }
}

/**
 * Whether two workspace paths name the same directory.
 * @param left - one absolute path (the session's recorded cwd).
 * @param right - the other absolute path (this window's workspace root).
 * @returns true when both resolve to the same path (case-insensitive on Windows).
 */
export function sameWorkspacePath(left: string, right: string): boolean {
  const normalize = (value: string): string => {
    const resolved = path.resolve(value)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  return normalize(left) === normalize(right)
}

/**
 * Notification-worthy reading of a turn boundary, or undefined when the user
 * already knows about that ending (a cancelled or blocked turn) or the feed's
 * reason is not one this extension reports.
 * @param event - one turn boundary.
 * @returns `completed`, `failed`, or undefined to stay silent.
 */
export function turnEventOutcome(event: TurnEventRecord): TurnEventOutcome | undefined {
  switch (event.reason) {
    case 'completed':
    case 'max-tokens':
      return 'completed'
    case 'error':
      return 'failed'
    default:
      return undefined
  }
}
