/**
 * Subagent lineage for the "delete session" gesture.
 *
 * dsh persists every Session in its own directory under
 * `$DSH_HOME/sessions/<projectKey>/<encoded session id>/`, and a subagent
 * tool's child Session is just another such directory: only its first JSONL
 * record (the header) carries the delegation edge — `origin: 'subagent'` plus
 * `parentSession`. The session list hides subagent sessions, so a child whose
 * spawning session was deleted can never be reached from the UI again; this
 * module finds those children (and their own children) so the caller can
 * remove them together with the deleted session.
 *
 * Reading a header needs the physical Session format, not the API: the
 * generation log is zstd-compressed by default (`session.v4.jsonl.zstd`), the
 * header is the first, independently decodable frame, and only that frame is
 * decompressed. Anything unreadable (torn header, unknown filename, corrupt
 * frame) is treated as "not a child" — cleanup is best effort and must never
 * block deleting the requested session.
 * @module sessionLineage
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { zstdDecompress } from 'node:zlib'

/** Lineage fields of one persisted Session header record. */
export interface StoredSessionLineage {
  /** The Session id recorded in the header. */
  readonly id: string
  /** The spawning Session id; present exactly for subagent Sessions. */
  readonly parentSession?: string
  /** `'subagent'` marks a Session spawned by a subagent tool. */
  readonly origin?: 'subagent'
}

/** Bytes read from a generation log: enough for a header frame plus slack. */
const HEAD_READ_BYTES = 64 * 1024
/** dsh generation log names: `session.jsonl`, `session.v4.jsonl`, `session.v4.jsonl.zstd`. */
const LOG_FILENAME = /^session(?:\.v(\d+))?\.jsonl(\.zstd)?$/
/** Concurrent header reads per project, keeping file descriptors bounded on cold caches. */
const READ_CONCURRENCY = 8
/** Zstandard frame magic, little-endian at the frame start. */
const ZSTD_MAGIC = 0xFD2FB528

/** Half-open byte range occupied by one structurally complete Zstandard frame. */
interface FrameRange {
  readonly start: number
  readonly end: number
}

/**
 * Locate the first structurally complete Zstandard frame in a byte prefix.
 * Follows the frame/block layout of dsh's own `scanZstdFrames`; unlike that
 * scanner this is a best-effort reader, so anything invalid or truncated
 * yields `undefined` instead of throwing.
 * @param buffer - bytes from the start of a concatenated-frame log.
 * @returns the first complete frame range, or `undefined`.
 */
function firstZstdFrame(buffer: Buffer): FrameRange | undefined {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== ZSTD_MAGIC) return undefined
  let offset = 4
  if (offset === buffer.length) return undefined
  const descriptor = buffer.readUInt8(offset)
  offset += 1
  if ((descriptor & 0x18) !== 0) return undefined
  const contentSizeFlag = descriptor >>> 6
  const singleSegment = (descriptor & 0x20) !== 0
  const checksum = (descriptor & 0x04) !== 0
  const dictionaryFlag = descriptor & 0x03
  const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
  const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
  offset += (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
  if (offset > buffer.length) return undefined
  for (;;) {
    if (buffer.length - offset < 3) return undefined
    const blockHeader = buffer.readUIntLE(offset, 3)
    offset += 3
    const lastBlock = (blockHeader & 0x01) !== 0
    const blockType = (blockHeader >>> 1) & 0x03
    if (blockType === 0x03) return undefined
    offset += blockType === 0x01 ? 1 : blockHeader >>> 3
    if (offset > buffer.length) return undefined
    if (lastBlock) break
  }
  if (checksum) {
    offset += 4
    if (offset > buffer.length) return undefined
  }
  return { start: 0, end: offset }
}

/**
 * Decompress one complete Zstandard frame.
 * @param frame - the frame bytes.
 * @returns the frame plaintext.
 */
function decompressFrame(frame: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zstdDecompress(frame, (error, plaintext) => {
      if (error === null) resolve(plaintext)
      else reject(error)
    })
  })
}

/**
 * Extract the first JSONL record from a generation log prefix.
 * @param buffer - bytes from the start of the file.
 * @param compressed - whether the log is zstd-compressed.
 * @returns the record text, or `undefined` when the prefix holds no complete record.
 */
async function firstRecord(buffer: Buffer, compressed: boolean): Promise<string | undefined> {
  if (!compressed) {
    const end = buffer.indexOf(0x0A)
    return end === -1 ? undefined : buffer.subarray(0, end).toString('utf8')
  }
  const frame = firstZstdFrame(buffer)
  if (frame === undefined) return undefined
  const plaintext = await decompressFrame(buffer.subarray(frame.start, frame.end))
  const end = plaintext.indexOf(0x0A)
  return end === -1 ? undefined : plaintext.subarray(0, end).toString('utf8')
}

/** Narrow an untrusted JSON value to a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read and validate one generation log's header lineage.
 * @param file - absolute generation log path.
 * @param compressed - whether the log is zstd-compressed.
 * @returns the lineage fields, or `undefined` when the header is unreadable.
 */
async function readLogLineage(file: string, compressed: boolean): Promise<StoredSessionLineage | undefined> {
  let handle: fs.promises.FileHandle | undefined
  try {
    handle = await fs.promises.open(file, 'r')
    const buffer = Buffer.alloc(HEAD_READ_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const prefix = buffer.subarray(0, bytesRead)
    const record = await firstRecord(prefix, compressed)
    if (record === undefined) return undefined
    const value: unknown = JSON.parse(record)
    if (!isRecord(value) || value.type !== 'session' || typeof value.id !== 'string') return undefined
    return {
      id: value.id,
      ...typeof value.parentSession === 'string' ? { parentSession: value.parentSession } : {},
      ...value.origin === 'subagent' ? { origin: 'subagent' as const } : {},
    }
  } catch {
    // Best effort: an unreadable, torn, unsupported, or corrupt log carries no lineage.
    return undefined
  } finally {
    try {
      await handle?.close()
    } catch {
      // A close failure cannot change the already-decided read result.
    }
  }
}

/**
 * Read the lineage of one persisted Session directory, preferring its newest
 * generation log and falling back through older generations.
 * @param sessionDir - the Session's directory under the sessions root.
 * @returns the header lineage, or `undefined` when no generation is readable.
 */
export async function readStoredSessionLineage(sessionDir: string): Promise<StoredSessionLineage | undefined> {
  let names: string[]
  try {
    names = await fs.promises.readdir(sessionDir)
  } catch {
    return undefined
  }
  const candidates: { version: number; name: string; compressed: boolean }[] = []
  for (const name of names) {
    const match = LOG_FILENAME.exec(name)
    if (match === null) continue
    candidates.push({
      version: match[1] === undefined ? 0 : Number(match[1]),
      name,
      compressed: match[2] === '.zstd',
    })
  }
  candidates.sort((left, right) => right.version - left.version)
  for (const candidate of candidates) {
    const lineage = await readLogLineage(path.join(sessionDir, candidate.name), candidate.compressed)
    if (lineage !== undefined) return lineage
  }
  return undefined
}

/**
 * Collect the session directories of every subagent Session spawned
 * (transitively) by one Session, whichever workspace directory each one was
 * persisted under. Non-subagent Sessions that merely carry a `parentSession`
 * (historical ordinary forks) are never included.
 * @param sessionsRoot - the dsh home's `sessions` directory.
 * @param sessionId - the Session being deleted.
 * @returns the descendant Session directories, parent-most first.
 */
export async function findSubagentSessionDirs(sessionsRoot: string, sessionId: string): Promise<string[]> {
  const children = new Map<string, { sessionId: string; dir: string }[]>()
  let projects: fs.Dirent[]
  try {
    projects = await fs.promises.readdir(sessionsRoot, { withFileTypes: true })
  } catch {
    return []
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const projectDir = path.join(sessionsRoot, project.name)
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(projectDir, { withFileTypes: true })
    } catch {
      continue
    }
    const sessionDirs = entries.filter(entry => entry.isDirectory()).map(entry => path.join(projectDir, entry.name))
    for (let index = 0; index < sessionDirs.length; index += READ_CONCURRENCY) {
      const batch = sessionDirs.slice(index, index + READ_CONCURRENCY)
      await Promise.all(batch.map(async (dir) => {
        const lineage = await readStoredSessionLineage(dir)
        if (lineage === undefined || lineage.origin !== 'subagent' || lineage.parentSession === undefined) return
        const list = children.get(lineage.parentSession) ?? []
        list.push({ sessionId: lineage.id, dir })
        children.set(lineage.parentSession, list)
      }))
    }
  }
  const found: string[] = []
  const foundDirs = new Set<string>()
  const visited = new Set<string>([sessionId])
  const pending = [sessionId]
  for (let index = 0; index < pending.length; index += 1) {
    const parent = pending[index]
    for (const child of children.get(parent) ?? []) {
      if (!foundDirs.has(child.dir)) {
        foundDirs.add(child.dir)
        found.push(child.dir)
      }
      if (!visited.has(child.sessionId)) {
        visited.add(child.sessionId)
        pending.push(child.sessionId)
      }
    }
  }
  return found
}
