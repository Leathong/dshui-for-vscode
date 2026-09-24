/**
 * Shared analysis of the `.dsh-src` workspace dependency closure.
 *
 * `sync-dsh.mjs` copies the `@deepseek-ai/dsh` runtime closure out of the
 * source checkout; `verify-deps.mjs` checks that the extension's root
 * `package.json` declares every third-party package that closure imports.
 * Both must agree on what the closure IS, so the walk lives here once.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

/** Workspace directories that contain `@deepseek-ai/*` packages. */
export const WORKSPACE_GLOBS = [
  'packages/*/*',
  'apps/*',
  'vendor/*',
  'native/landlock-run',
  'native/landlock-run/packages/*',
  'native/system',
  'native/system/packages/*',
]

/** Directory patterns to skip entirely (no runtime payload). */
export const SKIP_DIRS = new Set(['node_modules', '.git', 'lib', 'types', 'src', 'tests', 'dist'])

/** Expand a `*` segment (no `**`) against one level; recursive for `**`. */
export function expandGlob(base, segments, out) {
  const [head, ...rest] = segments
  if (head === undefined) {
    if (base !== '' && fs.existsSync(base)) out.push(base)
    return
  }
  const parent = base
  const pattern = head
  if (head === '**') {
    // Recursively collect directories, then continue with the rest.
    const walk = (dir, acc) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue
        const p = path.join(dir, entry.name)
        acc.push(p)
        walk(p, acc)
      }
    }
    const acc = []
    if (parent !== '' && fs.existsSync(parent)) walk(parent, acc)
    for (const sub of acc) expandGlob(sub, rest, out)
    return
  }
  if (!fs.existsSync(parent)) return
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    if (pattern === '*') {
      if (entry.isDirectory()) expandGlob(path.join(parent, entry.name), rest, out)
    } else if (entry.name === pattern) {
      expandGlob(path.join(parent, entry.name), rest, out)
    }
  }
}

/**
 * Resolve every workspace package dir (`@deepseek-ai/*` keyed by name).
 * @param srcDir - the `.dsh-src` checkout root.
 * @returns name → `{ dir, pkgObj }`.
 */
export function workspacePackages(srcDir) {
  const entries = []
  for (const glob of WORKSPACE_GLOBS) {
    const matched = []
    expandGlob(srcDir, glob.split('/'), matched)
    for (const dir of matched) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        entries.push({ dir, pkg: path.join(dir, 'package.json') })
      }
    }
  }
  const byName = new Map()
  for (const entry of entries) {
    let pkg
    try { pkg = JSON.parse(fs.readFileSync(entry.pkg, 'utf8')) } catch { continue }
    if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@deepseek-ai/')) continue
    byName.set(pkg.name, { ...entry, pkgObj: pkg })
  }
  return byName
}

/**
 * Runtime dependency closure from the CLI over deps + peerDeps, restricted to
 * `@deepseek-ai/*` workspace packages.
 * @param byName - workspace packages keyed by name.
 * @returns every reachable `@deepseek-ai/*` package name (including the CLI).
 */
export function runtimeClosure(byName) {
  const start = '@deepseek-ai/dsh'
  if (!byName.has(start)) throw new Error(`workspace has no ${start} (missing .dsh-src?)`)
  const seen = new Set([start])
  const stack = [start]
  while (stack.length > 0) {
    const name = stack.pop()
    const entry = byName.get(name)
    if (entry === undefined) continue
    const { pkgObj } = entry
    const deps = new Set([
      ...Object.keys(pkgObj.dependencies ?? {}),
      ...Object.keys(pkgObj.peerDependencies ?? {}),
      ...Object.keys(pkgObj.optionalDependencies ?? {}),
    ])
    for (const dep of deps) {
      if (!dep.startsWith('@deepseek-ai/') || seen.has(dep)) continue
      seen.add(dep)
      stack.push(dep)
    }
  }
  return seen
}

/**
 * 上游闭包里声明、但随扩展分发的 web profile 从不挂载/导入的依赖。
 * 它们不该进根清单（原生或超大依赖），也不算依赖缺口：
 *   - `sherpa-onnx-node`：`@deepseek-ai/dsh-experimental-speech-to-text-sensevoice`
 *     的本地语音识别运行时；该实验包不在 web profile 的组合树里（`dsh --dump-config`
 *     可验证），只有显式启用语音输入时才需要。
 */
export const NOT_SHIPPED_DEPS = new Set(['sherpa-onnx-node'])

/**
 * Third-party packages the closure imports at runtime. A `@deepseek-ai/*`
 * dependency that is NOT a workspace package (e.g. `@deepseek-ai/libreoffice-kit`,
 * published separately) counts as third-party here: nothing in `.dsh-src`
 * builds it, so only the root manifest can install it.
 * @param byName - workspace packages keyed by name.
 * @param closure - the `@deepseek-ai/*` closure from {@link runtimeClosure}.
 * @returns name → `{ spec, from }` for the first package that requires it.
 */
export function externalRuntimeDeps(byName, closure) {
  const required = new Map()
  for (const name of closure) {
    const entry = byName.get(name)
    if (entry === undefined) continue
    for (const [dep, spec] of Object.entries(entry.pkgObj.dependencies ?? {})) {
      if (dep.startsWith('@deepseek-ai/') && byName.has(dep)) continue
      if (NOT_SHIPPED_DEPS.has(dep)) continue
      if (!required.has(dep)) required.set(dep, { spec, from: name })
    }
  }
  return required
}

/**
 * Parse the minimum version a spec floor denotes: `^1.2.3`, `~1.2.3`, `1.2.3`,
 * `>=1.2.3` and `*` are all understood; anything else yields `undefined`.
 * Prerelease tags are dropped (a floor is only compared by its release part).
 * @param spec - a npm dependency spec.
 * @returns `[major, minor, patch]` or `undefined` when unrecognized.
 */
export function specFloor(spec) {
  const match = /^(?:\^|~|>=|=)?\s*(\d+)\.(\d+)\.(\d+)/.exec(String(spec))
  if (match === null) return undefined
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Whether an installed version meets a spec's floor. Only "is it at least the
 * version upstream asks for" is checked: npm resolves a looser root range
 * (e.g. `^4.1.0`) to the newest release, so a lower declared floor is fine as
 * long as what actually got installed is new enough.
 * @param installed - the installed version string.
 * @param spec - the upstream dependency spec.
 * @returns true when the installed release part is >= the spec floor.
 */
export function meetsSpec(installed, spec) {
  const want = specFloor(spec)
  const have = specFloor(installed)
  if (want === undefined || have === undefined) return true // unknown form: do not block
  for (let i = 0; i < 3; i += 1) {
    if (have[i] > want[i]) return true
    if (have[i] < want[i]) return false
  }
  return true
}

/**
 * Scan a `.dsh-src` checkout: workspace packages, the runtime closure and the
 * third-party dependencies that closure needs.
 * @param srcDir - the `.dsh-src` checkout root.
 */
export function scanClosure(srcDir) {
  const byName = workspacePackages(srcDir)
  const closure = runtimeClosure(byName)
  return { byName, closure, external: externalRuntimeDeps(byName, closure) }
}
