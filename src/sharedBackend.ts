/**
 * Shared-backend coordination for multiple extension windows: one dsh web
 * server per dsh home serves every window, each scoped to its own workspace
 * via the `dshui_workspace` URL query. Coordination state lives in the dsh
 * home as plain files (no IPC beyond the filesystem):
 *
 * - `dshui-server.json` — the lifecycle registry: the rendezvous port, the
 *   pid of the window that spawned the server (owner), and the pids of every
 *   window currently using it. The server's host plugin polls it and exits
 *   once no user pid is alive, so a detached server outlives its spawning
 *   window but never lingers after the last window closes. Writes are
 *   serialized with `dshui-server.lock` and committed via temp+rename.
 * - `dshui-workspaces/` — one JSON marker per folder a non-owner window wants
 *   registered as a workspace. The host plugin polls the directory, calls
 *   `workspaceRegistry.create(path)`, and removes the marker on success.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const REGISTRY_FILE = 'dshui-server.json'
const LOCK_FILE = 'dshui-server.lock'
const MARKER_DIR = 'dshui-workspaces'
const LOCK_TIMEOUT_MS = 8000

/**
 * A random id generated once per extension-host process. Registry and bridge
 * entries carry this id plus a heartbeat timestamp, so a recycled OS pid can
 * never keep a dead window's lease alive: a reused pid belongs to a different
 * process, does not know this id, and therefore never refreshes that lease.
 */
const HOST_INSTANCE_ID = `${process.pid}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
/** A live user must refresh its lease at least this often. */
export const SERVER_USER_LEASE_TTL_MS = 45_000
const SERVER_USER_HEARTBEAT_MS = 10_000

/** One extension host using the shared server. */
export interface ServerUser {
  pid: number
  /** Random per-process instance id; distinguishes a reused pid from the original process. */
  id: string
  /** Last successful heartbeat (epoch ms). */
  lastSeen: number
}

export interface ServerRegistry {
  port: number
  /** Pid of the extension host that spawned the server. */
  owner: number
  /** Extension hosts currently using the server (owner included). */
  users: ServerUser[]
}

function isServerUserShape(user: unknown): user is ServerUser {
  if (typeof user !== 'object' || user === null) return false
  const candidate = user as Partial<ServerUser>
  return Number.isInteger(candidate.pid) && (candidate.pid ?? 0) > 0
    && typeof candidate.id === 'string' && candidate.id !== ''
    && typeof candidate.lastSeen === 'number' && Number.isFinite(candidate.lastSeen)
}

function currentServerUser(): ServerUser {
  return { pid: process.pid, id: HOST_INSTANCE_ID, lastSeen: Date.now() }
}

/**
 * True while the lease is fresh AND the OS pid is alive. `isAlive` alone is
 * not sufficient: after a crash the pid may be recycled by an unrelated
 * process, which would make the old entry look alive forever.
 */
export function isServerUserLive(user: ServerUser, now = Date.now()): boolean {
  return isAlive(user.pid) && now - user.lastSeen <= SERVER_USER_LEASE_TTL_MS
}

export function registryPath(dshHome: string): string {
  return path.join(dshHome, REGISTRY_FILE)
}

export function markerDir(dshHome: string): string {
  return path.join(dshHome, MARKER_DIR)
}

/** Process liveness via signal 0; EPERM means the pid exists but is not ours. */
export function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * A registry/bridge lock file left behind by a crashed extension host must
 * not block every future window forever. The lock file carries the owning
 * pid plus a random token; a waiter may remove it when the owner is dead.
 * A valid owner never holds the lock for more than a few milliseconds, so a
 * lock held by a live pid for `LOCK_STALE_MS` is treated as a hung process.
 */
const LOCK_STALE_MS = 60_000
/** An owner can be killed between `open(..., 'wx')` and the first write. */
const LOCK_EMPTY_STALE_MS = 5_000

interface LockOwner {
  pid: number
  token: string
  createdAt: number
}

function readLockOwner(lock: string): LockOwner | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(lock, 'utf8')) as Partial<LockOwner>
    if (
      typeof parsed.pid !== 'number' || !Number.isInteger(parsed.pid) || parsed.pid <= 0
      || typeof parsed.token !== 'string' || parsed.token === ''
      || typeof parsed.createdAt !== 'number'
    ) return null
    return { pid: parsed.pid, token: parsed.token, createdAt: parsed.createdAt }
  } catch {
    return null
  }
}

/** True when the current lock owner is dead, hung, or left an unreadable file. */
function isStaleLockFile(lock: string): boolean {
  let mtimeMs: number
  try {
    mtimeMs = fs.statSync(lock).mtimeMs
  } catch {
    return true // Released between EEXIST and this read: retry immediately.
  }
  const owner = readLockOwner(lock)
  if (owner === null) return Date.now() - mtimeMs > LOCK_EMPTY_STALE_MS
  if (!isAlive(owner.pid)) return true
  return Date.now() - owner.createdAt > LOCK_STALE_MS
}

/** Serialize registry mutations across windows with an exclusive lock file. */
async function withRegistryLock<T>(dshHome: string, fn: () => Promise<T> | T): Promise<T> {
  const lock = path.join(dshHome, LOCK_FILE)
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  const token = `${process.pid}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx')
      try {
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token, createdAt: Date.now() } satisfies LockOwner))
      } finally {
        fs.closeSync(fd)
      }
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      try {
        if (isStaleLockFile(lock)) {
          fs.rmSync(lock, { force: true })
          continue
        }
      } catch {
        // The lock disappeared (owner released it); loop and try again.
        continue
      }
      if (Date.now() > deadline) {
        throw new Error(`dshui server registry lock timeout: ${lock}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  try {
    return await fn()
  } finally {
    // Only remove our own lock: a stale-removal race could otherwise delete
    // a lock that another window just acquired.
    try {
      if (readLockOwner(lock)?.token === token) fs.rmSync(lock, { force: true })
    } catch { /* best-effort lock release */ }
  }
}

export function readRegistry(dshHome: string): ServerRegistry | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(dshHome), 'utf8')) as Partial<ServerRegistry>
    if (
      typeof parsed.port !== 'number' || typeof parsed.owner !== 'number'
      || !Array.isArray(parsed.users) || !parsed.users.every(isServerUserShape)
    ) return null
    return { port: parsed.port, owner: parsed.owner, users: parsed.users }
  } catch {
    return null
  }
}

function writeRegistry(dshHome: string, registry: ServerRegistry): void {
  const tmp = `${registryPath(dshHome)}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(registry))
  fs.renameSync(tmp, registryPath(dshHome))
}

/**
 * Register this extension host as a user of the shared server. Adopting a
 * server whose registry does not exist yet (the spawning window has not
 * written it, or an older extension version started the server) creates the
 * registry with this window as its only user instead of silently skipping:
 * a dropped registration would let the host plugin see no live users and
 * self-exit right under this window (the attach-before-register race). The
 * unknown owner is a sentinel `0` — the host plugin's self-check only reads
 * `users`, and every later write replaces `owner` with a real pid.
 * @param dshHome - the dsh home the shared server runs under.
 * @param port - the rendezvous port.
 * @param owner - true when this window spawned the server.
 */
export async function registerServerUser(dshHome: string, port: number, owner: boolean): Promise<void> {
  await withRegistryLock(dshHome, () => {
    const existing = readRegistry(dshHome)
    // 采纳服务器但注册表尚不存在（owner 窗口还没登记，或服务器由旧版本
    // 窗口启动）：创建注册表并登记自己——绝不能静默跳过，否则 host 插件
    // 会把本窗口误判为不存在而退出共享服务器（见文件头注释的竞态）。
    if (existing === null && !owner) {
      writeRegistry(dshHome, { port, owner: 0, users: [currentServerUser()] })
      return
    }
    const users = (existing?.users ?? [])
      .filter((user) => user.pid !== process.pid && isServerUserLive(user))
    users.push(currentServerUser())
    writeRegistry(dshHome, {
      port,
      owner: owner ? process.pid : (existing?.owner ?? process.pid),
      users,
    })
  })
}

/**
 * Remove this extension host from the shared server's user list. In shared
 * mode, a missing registry (nobody's registration ever landed — the same
 * attach-before-register race) is materialized as an empty registry so the
 * detached server's host-plugin self-check can reap it; without a registry
 * file the self-check idles forever and the server would leak.
 * @param dshHome - the dsh home the shared server runs under.
 * @param shared - true when this window participates in the shared backend.
 */
export async function unregisterServerUser(dshHome: string, shared: boolean): Promise<void> {
  await withRegistryLock(dshHome, () => {
    const existing = readRegistry(dshHome)
    if (existing === null) {
      // Only a shared-backend participant may materialize the empty registry
      // that tells the detached server to self-reap. A non-shared window
      // (port 0) must never create this file: every dsh server polls the same
      // dsh home, and an empty registry would make independent per-window
      // servers exit under a still-live window.
      if (!shared) return
      writeRegistry(dshHome, { port: 0, owner: process.pid, users: [] })
      return
    }
    writeRegistry(dshHome, {
      ...existing,
      users: existing.users.filter((user) => user.pid !== process.pid && isServerUserLive(user)),
    })
  })
}

/** True when the registry tracks any live user other than this process. */
export function hasOtherLiveUsers(dshHome: string): boolean {
  const registry = readRegistry(dshHome)
  if (registry === null) return false
  return registry.users.some((user) => user.pid !== process.pid && isServerUserLive(user))
}

/**
 * Refresh this extension host's leases in the shared registry and bridge
 * table. Called periodically by `startServerUserHeartbeat`. The id stored in
 * each lease is secret to this process, so a recycled pid cannot extend it:
 * the new process never learns the old id and the lease expires after
 * `SERVER_USER_LEASE_TTL_MS`.
 */
async function refreshSharedLeases(dshHome: string): Promise<void> {
  await withRegistryLock(dshHome, () => {
    const registry = readRegistry(dshHome)
    if (registry !== null) {
      const hasSelf = registry.users.some((user) => user.pid === process.pid && user.id === HOST_INSTANCE_ID)
      const users = registry.users.filter((user) => user.pid !== process.pid && isServerUserLive(user))
      if (hasSelf) users.push(currentServerUser())
      writeRegistry(dshHome, { ...registry, users })
    }

    const bridges = readBridges(dshHome)
    const existing = bridges[process.pid]
    if (existing !== undefined) {
      bridges[process.pid] = { ...existing, id: HOST_INSTANCE_ID, lastSeen: Date.now() }
      writeBridges(dshHome, bridges)
    }
  })
}

/** Start the background lease heartbeat for this extension host. */
export function startServerUserHeartbeat(dshHome: string): NodeJS.Timeout {
  void refreshSharedLeases(dshHome).catch(() => { /* best-effort heartbeat */ })
  const timer = setInterval(() => {
    void refreshSharedLeases(dshHome).catch(() => { /* best-effort heartbeat */ })
  }, SERVER_USER_HEARTBEAT_MS)
  timer.unref()
  return timer
}

/**
 * Ask the shared server's host plugin to register a workspace path. The
 * plugin polls the marker directory and calls `workspaceRegistry.create`.
 * Idempotent: an already-registered workspace resolves immediately.
 * @param dshHome - the dsh home the shared server runs under.
 * @param workspacePath - canonical path of the folder to register.
 */
export function writeWorkspaceMarker(dshHome: string, workspacePath: string): void {
  const dir = markerDir(dshHome)
  fs.mkdirSync(dir, { recursive: true })
  const name = Buffer.from(workspacePath, 'utf8').toString('base64url')
  // Atomic commit via temp+rename. The host plugin polls every 2s and only
  // consumes `*.json`; a direct write could be observed half-written, parsed
  // as invalid, and deleted before registration ever happens.
  const target = path.join(dir, `${name}.json`)
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify({ path: workspacePath }))
    fs.renameSync(tmp, target)
  } catch (error) {
    fs.rmSync(tmp, { force: true })
    throw error
  }
}

/** One window's open-bridge registration for workspace-aware file routing. */
export interface BridgeEntry {
  pid: number
  /** Same per-process instance id as the server-user lease. */
  id: string
  /** Canonical workspace path this window has open. */
  workspace: string
  /** Absolute URL of the window's local open bridge (…/open). */
  endpoint: string
  /** Last successful heartbeat (epoch ms). */
  lastSeen: number
}

function isBridgeEntryShape(entry: unknown): entry is BridgeEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const candidate = entry as Partial<BridgeEntry>
  return Number.isInteger(candidate.pid) && (candidate.pid ?? 0) > 0
    && typeof candidate.id === 'string' && candidate.id !== ''
    && typeof candidate.workspace === 'string' && candidate.workspace !== ''
    && typeof candidate.endpoint === 'string' && candidate.endpoint !== ''
    && typeof candidate.lastSeen === 'number' && Number.isFinite(candidate.lastSeen)
}

function isBridgeEntryLive(entry: BridgeEntry, now = Date.now()): boolean {
  return isAlive(entry.pid) && now - entry.lastSeen <= SERVER_USER_LEASE_TTL_MS
}

const BRIDGES_FILE = 'dshui-bridges.json'

export function bridgesPath(dshHome: string): string {
  return path.join(dshHome, BRIDGES_FILE)
}

/** Read the bridge registrations, pruning entries of dead windows on the way. */
function readBridges(dshHome: string): Record<number, BridgeEntry> {
  try {
    const parsed = JSON.parse(fs.readFileSync(bridgesPath(dshHome), 'utf8')) as Record<string, BridgeEntry>
    const result: Record<number, BridgeEntry> = {}
    for (const [key, entry] of Object.entries(parsed)) {
      const pid = Number(key)
      if (Number.isInteger(pid) && pid > 0 && isBridgeEntryShape(entry) && isBridgeEntryLive(entry)) {
        result[pid] = { ...entry, pid }
      }
    }
    return result
  } catch {
    return {}
  }
}

function writeBridges(dshHome: string, bridges: Record<number, BridgeEntry>): void {
  const tmp = `${bridgesPath(dshHome)}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(bridges))
  fs.renameSync(tmp, bridgesPath(dshHome))
}

/**
 * Register this window's open bridge for workspace-aware file routing: the
 * api-proxy patch picks the bridge whose workspace is the longest path
 * prefix of the opened file, so a file clicked in window B opens in B (not
 * in the owner window). Updates this window's entry; writes are serialized
 * with the same registry lock.
 * @param dshHome - the dsh home.
 * @param workspace - canonical path of this window's workspace.
 * @param endpoint - absolute URL of this window's open bridge.
 */
export async function registerBridge(dshHome: string, workspace: string, endpoint: string): Promise<void> {
  await withRegistryLock(dshHome, () => {
    const bridges = readBridges(dshHome)
    bridges[process.pid] = {
      pid: process.pid,
      id: HOST_INSTANCE_ID,
      workspace,
      endpoint,
      lastSeen: Date.now(),
    }
    writeBridges(dshHome, bridges)
  })
}

/** Remove this window's open-bridge registration. */
export async function unregisterBridge(dshHome: string): Promise<void> {
  await withRegistryLock(dshHome, () => {
    const bridges = readBridges(dshHome)
    delete bridges[process.pid]
    writeBridges(dshHome, bridges)
  })
}
