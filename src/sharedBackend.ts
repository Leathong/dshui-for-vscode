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
const LOCK_TIMEOUT_MS = 3000

export interface ServerRegistry {
  port: number
  /** Pid of the extension host that spawned the server. */
  owner: number
  /** Pids of extension hosts currently using the server (owner included). */
  users: number[]
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

/** Serialize registry mutations across windows with an exclusive lock file. */
async function withRegistryLock<T>(dshHome: string, fn: () => Promise<T> | T): Promise<T> {
  const lock = path.join(dshHome, LOCK_FILE)
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx')
      fs.closeSync(fd)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (Date.now() > deadline) {
        throw new Error(`dshui server registry lock timeout: ${lock}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  try {
    return await fn()
  } finally {
    fs.rmSync(lock, { force: true })
  }
}

export function readRegistry(dshHome: string): ServerRegistry | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(dshHome), 'utf8')) as Partial<ServerRegistry>
    if (
      typeof parsed.port !== 'number' || typeof parsed.owner !== 'number'
      || !Array.isArray(parsed.users) || parsed.users.some((pid) => typeof pid !== 'number')
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
 * a dropped registration would make the owner's close-time check see "no
 * other live users" and stop the server right under this window (the
 * attach-before-register race). The unknown owner is a sentinel `0` — the
 * host plugin's self-check only reads `users`, and every later write
 * replaces `owner` with a real pid.
 * @param dshHome - the dsh home the shared server runs under.
 * @param port - the rendezvous port.
 * @param owner - true when this window spawned the server.
 */
export async function registerServerUser(dshHome: string, port: number, owner: boolean): Promise<void> {
  await withRegistryLock(dshHome, () => {
    const existing = readRegistry(dshHome)
    // 采纳服务器但注册表尚不存在（owner 窗口还没登记，或服务器由旧版本
    // 窗口启动）：创建注册表并登记自己——绝不能静默跳过，否则 owner 关闭
    // 时会把本窗口误判为不存在而停掉共享服务器（见文件头注释的竞态）。
    if (existing === null && !owner) {
      writeRegistry(dshHome, { port, owner: 0, users: [process.pid] })
      return
    }
    const users = [...new Set([...(existing?.users ?? []), process.pid])]
    // Prune pids of crashed windows so the server self-check stays accurate.
    const live = users.filter((pid) => pid === process.pid || isAlive(pid))
    writeRegistry(dshHome, {
      port,
      owner: owner ? process.pid : (existing?.owner ?? process.pid),
      users: live,
    })
  })
}

/**
 * Remove this extension host from the shared server's user list. A missing
 * registry (nobody's registration ever landed — the same attach-before-
 * register race) is materialized as an empty registry so the detached
 * server's host-plugin self-check can reap it; without a registry file the
 * self-check idles forever and the server would leak.
 */
export async function unregisterServerUser(dshHome: string): Promise<void> {
  await withRegistryLock(dshHome, () => {
    const existing = readRegistry(dshHome)
    if (existing === null) {
      writeRegistry(dshHome, { port: 0, owner: process.pid, users: [] })
      return
    }
    writeRegistry(dshHome, {
      ...existing,
      users: existing.users.filter((pid) => pid !== process.pid && isAlive(pid)),
    })
  })
}

/** True when the registry tracks any live user other than this process. */
export function hasOtherLiveUsers(dshHome: string): boolean {
  const registry = readRegistry(dshHome)
  if (registry === null) return false
  return registry.users.some((pid) => pid !== process.pid && isAlive(pid))
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
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ path: workspacePath }))
}

/** One window's open-bridge registration for workspace-aware file routing. */
export interface BridgeEntry {
  pid: number
  /** Canonical workspace path this window has open. */
  workspace: string
  /** Absolute URL of the window's local open bridge (…/open). */
  endpoint: string
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
      if (
        typeof entry === 'object' && entry !== null
        && Number.isInteger(pid) && pid > 0
        && typeof entry.workspace === 'string' && entry.workspace !== ''
        && typeof entry.endpoint === 'string' && entry.endpoint !== ''
        && isAlive(pid)
      ) result[pid] = { pid, workspace: entry.workspace, endpoint: entry.endpoint }
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
    bridges[process.pid] = { pid: process.pid, workspace, endpoint }
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
