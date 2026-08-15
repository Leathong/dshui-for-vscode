/**
 * Cross-platform "kill the process listening on a TCP port" helper.
 *
 * Used by the restart-server command to take over a shared dsh server that
 * another window spawned: this window holds no handle to that child process
 * (`DshServer.attach`), so the listener pid is discovered via OS tools —
 * `lsof` on macOS/Linux, `netstat` + `taskkill` on Windows — and terminated.
 * Only the process actually bound to the dsh port is touched, so the open
 * bridge (random port) and the extension host are never affected.
 */
import { execFile } from 'node:child_process'

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, windowsHide: true }, (error, stdout) => {
      // Any failure (missing tool, empty result, non-zero exit) is treated as
      // "no pids found" — the caller falls back to its own error path.
      resolve(error === null ? String(stdout) : '')
    })
  })
}

/** Liveness via signal 0; EPERM means the pid exists but is not ours. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Pids of the processes currently listening on `port` (empty on any failure). */
async function pidsListeningOn(port: number): Promise<number[]> {
  const pids = new Set<number>()
  if (process.platform === 'win32') {
    const out = await run('netstat', ['-ano', '-p', 'tcp'])
    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue
      const match = /:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i.exec(line)
      if (match !== null && Number(match[1]) === port) pids.add(Number(match[2]))
    }
  } else {
    const out = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    for (const line of out.split(/\r?\n/)) {
      const pid = Number.parseInt(line.trim(), 10)
      if (Number.isInteger(pid) && pid > 0) pids.add(pid)
    }
  }
  return [...pids]
}

/**
 * Terminate every process listening on `port`. POSIX: SIGTERM, wait up to 5s,
 * then SIGKILL. Windows: `taskkill /T /F`. Resolves `false` when nothing was
 * listening (nothing to kill).
 */
export async function killProcessOnPort(port: number): Promise<boolean> {
  const pids = await pidsListeningOn(port)
  if (pids.length === 0) return false

  if (process.platform === 'win32') {
    for (const pid of pids) {
      await run('taskkill', ['/PID', String(pid), '/T', '/F'])
    }
    return true
  }

  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
  const deadline = Date.now() + 5000
  for (;;) {
    if (pids.every((pid) => !isAlive(pid))) return true
    if (Date.now() > deadline) {
      for (const pid of pids) {
        try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
      }
      // Let the force-kill land before the caller probes the port again.
      await new Promise((resolve) => setTimeout(resolve, 300))
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
