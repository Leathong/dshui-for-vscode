/**
 * Populate the extension's `node_modules/@deepseek-ai/*` from the dsh source
 * checkout (`.dsh-src`) instead of the npm registry.
 *
 * The dsh host (and the client bundles' static dependencies) are compiled from
 * source; this script copies the built `@deepseek-ai/dsh` runtime closure into
 * `node_modules/@deepseek-ai/*` as real files, and rewrites `package.json` so
 * the root manifest keeps a single `@deepseek-ai/dsh` anchor whose manifest
 * lists the whole closure as its (transitive) dependencies — that keeps the
 * root clean and lets `npm list --production` (which vsce runs) accept the
 * closure without the registry ever being consulted.
 *
 * npm runs this as its `preinstall`, so the source-built copies are in place
 * before install resolves the tree and are left untouched (no registry fetch).
 *
 * Prerequisites (run in `.dsh-src` first):
 *   git clone ... .dsh-src
 *   git apply ../patches/dshui-bundles.patch
 *   pnpm install
 *   pnpm run build:lib:host && pnpm run build:lib:client
 *
 *   node scripts/sync-dsh.mjs
 *
 * Packages in the closure that declare native binaries (e.g. the Landlock
 * addon and its platform packages) are copied as-is (per their `files` glob);
 * if a native binary has not been built, the script warns and leaves the
 * loader's `node_modules` layout — do not ship a vsix with such a warning on
 * a platform that needs the binary.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runtimeClosure, workspacePackages } from './lib/dsh-closure.mjs'
import { assertDependencies } from './verify-deps.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, '.dsh-src')
/** node_modules/@deepseek-ai — real source-built copies the dsh loader resolves. */
const targetRoot = path.join(root, 'node_modules', '@deepseek-ai')
/** Browser shell package whose `dist/` bundles the client plugins' shared modules. */
const WEB_FRONTEND = '@deepseek-ai/dsh-web-frontend'


/** Rewrite `workspace:` protocol references in a copied package.json. */
function rewriteWorkspaceRefs(pkg, versionFor) {
  const clone = JSON.parse(JSON.stringify(pkg))
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = clone[section]
    if (deps === null || typeof deps !== 'object') continue
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string' || !spec.startsWith('workspace:')) continue
      const version = versionFor.get(name)
      const rest = spec.slice('workspace:'.length)
      if (version === undefined) {
        deps[name] = rest === '*' ? '*' : rest === '^' ? '*'
          : rest === '~' ? '*' : rest
        continue
      }
      // Fold the protocol suffix: `^` → `^<version>`, `~` → `~<version>`, `*` → `<version>`.
      if (rest === '^') deps[name] = `^${version}`
      else if (rest === '~') deps[name] = `~${version}`
      else if (rest === '*' || rest === '') deps[name] = version
      else deps[name] = `${rest}${version}`
    }
  }
  return clone
}

/** Copy one file path (mkdir parents as needed) into the target dir. */
function copyFileTo(fromPath, relEntry, targetDir) {
  const toPath = path.join(targetDir, relEntry)
  fs.mkdirSync(path.dirname(toPath), { recursive: true })
  fs.copyFileSync(fromPath, toPath)
}

/** Recursively copy a built package's runtime payload into `node_modules/@deepseek-ai/<name>`. */
function copyPackage(entry, name, versionFor, targetDir, dshDeps) {
  const { dir, pkgObj } = entry
  const pkg = rewriteWorkspaceRefs(pkgObj, versionFor)
  // The @deepseek-ai packages are built and linked from source; Node resolves
  // their bare imports by walking node_modules, never via these fields. Keep
  // the anchor package `@deepseek-ai/dsh` listing the FULL @deepseek-ai closure
  // as its dependencies so npm list (which vsce runs) sees them all as dsh's
  // transitive deps (in the tree, not extraneous) — the root package.json then
  // only needs `@deepseek-ai/dsh`. Every other package has its dep lists
  // stripped so npm list has nothing to flag for conflicting transitive majors.
  if (name === '@deepseek-ai/dsh') {
    pkg.dependencies = { ...dshDeps }
    delete pkg.devDependencies
    delete pkg.peerDependencies
    delete pkg.optionalDependencies
  } else {
    for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']) {
      delete pkg[section]
    }
  }
  fs.mkdirSync(targetDir, { recursive: true })
  fs.writeFileSync(path.join(targetDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)

  const files = Array.isArray(pkgObj.files) && pkgObj.files.length > 0 ? pkgObj.files : []
  let copied = 1 // package.json

  // 1) Always copy the whole compiled `lib/` (the runtime) minus build residue.
  const libDir = path.join(dir, 'lib')
  if (fs.existsSync(libDir)) {
    const walk = (from, rel) => {
      for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const relEntry = rel === '' ? entry.name : `${rel}/${entry.name}`
        const fromPath = path.join(from, entry.name)
        if (entry.isFile() && /\.(tsbuildinfo|map)$/.test(entry.name)) continue
        if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name === '.git')) continue
        const toPath = path.join(targetDir, 'lib', relEntry)
        if (entry.isDirectory()) {
          fs.mkdirSync(toPath, { recursive: true })
          walk(fromPath, relEntry)
        } else {
          fs.mkdirSync(path.dirname(toPath), { recursive: true })
          fs.copyFileSync(fromPath, toPath)
          copied += 1
        }
      }
    }
    walk(libDir, '')
  }

  // 2) Copy non-lib payload declared by `files` (assets, bin/, config, ...).
  if (files.length > 0) {
    const roots = new Set()
    for (const raw of files) {
      if (raw.startsWith('!')) continue
      const normalized = raw.replace(/^\.\//, '').replace(/\/$/, '')
      if (normalized.startsWith('lib/')) continue
      roots.add(normalized.split('/').map((s) => s.includes('*') || s.includes('?') ? null : s).join('/'))
    }
    for (const candidate of roots) {
      if (candidate === '' || candidate.includes('*') || candidate.includes('?')) continue
      const fromRoot = path.join(dir, candidate)
      if (!fs.existsSync(fromRoot)) continue
      if (fs.statSync(fromRoot).isFile()) {
        copyFileTo(fromRoot, candidate, targetDir)
        copied += 1
        continue
      }
      // A directory root: copy everything under it (the glob is a directory).
      // Note: do NOT apply SKIP_DIRS here — a payload dir named `dist` (the web
      // frontend static SPA) is a legitimate `files` entry, not a source tree.
      if (fs.readdirSync(fromRoot).length === 0) continue
      const walk = (from, rel) => {
        for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
          const relEntry = rel === '' ? entry.name : `${rel}/${entry.name}`
          const fromPath = path.join(from, entry.name)
          const toPath = path.join(targetDir, candidate, relEntry)
          if (entry.isDirectory()) {
            fs.mkdirSync(toPath, { recursive: true })
            walk(fromPath, relEntry)
          } else {
            fs.mkdirSync(path.dirname(toPath), { recursive: true })
            fs.copyFileSync(fromPath, toPath)
            copied += 1
          }
        }
      }
      walk(fromRoot, '')
    }
  }

  // License/notice files for legal compliance (match the npm-published view).
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    const from = path.join(dir, file)
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(targetDir, file))
  }

  // Bundle overlay declared by `dsh.bundle.patch` (some packages ship it).
  const bundlePatch = path.join(dir, 'cordis.patch.yml')
  if (fs.existsSync(bundlePatch)) fs.copyFileSync(bundlePatch, path.join(targetDir, 'cordis.patch.yml'))

  // Warn about a missing native binary for platform-native packages.
  const native = path.join(targetDir, 'bin')
  if (fs.existsSync(native)) {
    const hasBinary = fs.readdirSync(native).some((f) => !f.endsWith('.json'))
    if (!hasBinary) console.warn(`  ! ${name}: native binary dir present but empty (build the native addon first)`)
  }
  return copied
}

/** Copy one built package into node_modules (real source-built copies). */
function writePackage(entry, name, versionFor, targetDir, dshDeps) {
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })
  copyPackage(entry, name, versionFor, targetDir, dshDeps)
}

/** Sync package.json `dependencies`: keep a single @deepseek-ai anchor (`@deepseek-ai/dsh`)
 *  whose own manifest lists the whole @deepseek-ai closure as transitive deps. This keeps the
 *  root manifest clean (one @deepseek-ai entry) while npm list (vsce) still sees the closure as
 *  installed and in the tree.
 *
 *  Only WORKSPACE packages are dropped: this script copies those from `.dsh-src` and strips their
 *  dependency tables, so npm must not fetch them. A published `@deepseek-ai/*` package that is not
 *  in the workspace (e.g. `@deepseek-ai/libreoffice-kit`) is an ordinary third-party dependency —
 *  nothing here builds it, so the root manifest is its only installer and the entry must survive. */
function syncPackageJsonDeps(closure, byName) {
  const pkgPath = path.join(root, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const deps = pkg.dependencies ?? {}
  for (const name of Object.keys(deps)) {
    if (name.startsWith('@deepseek-ai/') && byName.has(name)) delete deps[name]
  }
  const anchor = byName.get('@deepseek-ai/dsh')
  if (anchor !== undefined) deps['@deepseek-ai/dsh'] = `^${anchor.pkgObj.version}`
  pkg.dependencies = deps
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  return deps
}

/** Newest modification time under `dir` (`0` when the tree is missing/empty). */
function newestMtime(dir, skip = new Set()) {
  let newest = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) { stack.push(full); continue }
      try { newest = Math.max(newest, fs.statSync(full).mtimeMs) } catch { /* unreadable entry */ }
    }
  }
  return newest
}

/**
 * Fail when the browser shell (`@deepseek-ai/dsh-web-frontend/dist`) is older
 * than its sources.
 *
 * The shell is the page every client plugin bundle runs inside, and it bundles
 * the shared modules those bundles `require` at runtime (`react`,
 * `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
 * ...). `pnpm run build:lib` rebuilds the host/client libraries but NOT this
 * Vite app, so after a dsh upgrade a stale shell silently keeps exporting the
 * previous release's shared modules: the 0.1.7 settings plugins then die with
 * `settingsNumberField is not a function` ("Failed to load plugins") while
 * every other artifact looks correct.
 * @param byName - workspace packages keyed by name.
 */
function assertWebFrontendFresh(byName) {
  if (process.env.DSHUI_ALLOW_STALE_WEB === '1') return
  const entry = byName.get(WEB_FRONTEND)
  if (entry === undefined) return
  const distNewest = newestMtime(path.join(entry.dir, 'dist'))
  const srcNewest = newestMtime(path.join(entry.dir, 'src'))
  if (distNewest === 0) {
    throw new Error(`[sync-dsh] ${WEB_FRONTEND} 缺少 dist/ 构建产物：先在 .dsh-src 执行 pnpm run build:web`)
  }
  if (srcNewest > distNewest) {
    throw new Error(
      `[sync-dsh] ${WEB_FRONTEND}/dist 比源码旧（${new Date(distNewest).toISOString()} < ${new Date(srcNewest).toISOString()}）。\n`
      + '  浏览器 shell 里打包了客户端插件运行时 require 的共享模块（react / ui-slots / ui-primitives …）；\n'
      + '  shell 过旧会让新版插件全部加载失败（Failed to load plugins / settingsNumberField is not a function）。\n'
      + '  修复：cd .dsh-src && pnpm run build:web（几秒即可）。确需跳过请设 DSHUI_ALLOW_STALE_WEB=1。',
    )
  }
}

async function main() {
  if (!fs.existsSync(src)) {
    // No .dsh-src checkout (e.g. a fresh clone that did not fetch the upstream
    // harness yet). The extension's @deepseek-ai runtime cannot be built here,
    // so warn and leave the tree as-is; npm's preinstall must not hard-fail.
    console.warn(`[sync-dsh] 未找到 dsh 源码检出：${src}`)
    console.warn('（需要先 clone 并构建 .dsh-src，见脚本头部注释；扩展的 @deepseek-ai 运行时无法从 npm 下载）')
    return
  }
  console.log(`[sync-dsh] 从 ${src} 同步 @deepseek-ai/* 到 ${targetRoot}`)
  const byName = workspacePackages(src)
  console.log(`[sync-dsh] workspace @deepseek-ai 包：${byName.size}`)
  assertWebFrontendFresh(byName)
  const closure = runtimeClosure(byName)
  console.log(`[sync-dsh] @deepseek-ai/dsh 运行时闭包含 ${closure.size} 个包`)
  // Fail fast when the root manifest does not declare a third-party package the
  // closure imports: this runs as npm's preinstall, so the error lands before a
  // broken tree is built (the version check runs later, in verify-deps).
  try {
    assertDependencies(false)
  } catch (error) {
    console.error(`\n${error.message}\n`)
    process.exit(1)
  }
  const deps = syncPackageJsonDeps(closure, byName)
  console.log(`[sync-dsh] package.json dependencies 已更新：${Object.keys(deps).length} 项`)

  const versionFor = new Map()
  for (const [name, entry] of byName) versionFor.set(name, entry.pkgObj.version)
  const dshDeps = {}
  for (const name of closure) {
    if (name === '@deepseek-ai/dsh') continue
    const version = versionFor.get(name)
    dshDeps[name] = version === undefined ? '*' : version
  }

  fs.mkdirSync(targetRoot, { recursive: true })
  let copiedCount = 0
  const copiedNames = []
  const missingLib = []
  for (const name of closure) {
    const entry = byName.get(name)
    if (entry === undefined) { console.warn(`  ! ${name} 不在 workspace（跳过）`); continue }
    if (!fs.existsSync(path.join(entry.dir, 'lib'))) {
      // Platform-native packages ship a `bin/` payload (built binaries) and no
      // JS lib; copy them through the files path instead of warning. A missing
      // `bin/` (not built) is the real failure.
      const binDir = path.join(entry.dir, 'bin')
      if (!fs.existsSync(binDir) || fs.readdirSync(binDir).length === 0) {
        missingLib.push(name)
        continue
      }
    }
    const scopeName = name.slice('@deepseek-ai/'.length)
    writePackage(entry, name, versionFor, path.join(targetRoot, scopeName), dshDeps)
    copiedCount += 1
    copiedNames.push(name)
    console.log(`  ✓ ${name}`)
  }
  // The anchor manifest's dependency closure must list only packages that were
  // actually copied — npm list (which vsce runs) treats every listed dep as
  // required, so an unbuilt platform package (other OS/arch) must not appear.
  // The anchor was written during the loop with the full closure; rewrite it
  // now with the copied set (JSON key order follows the closure walk).
  const dshDepsCopied = {}
  for (const name of copiedNames) {
    if (name === '@deepseek-ai/dsh') continue
    const version = versionFor.get(name)
    dshDepsCopied[name] = version === undefined ? '*' : version
  }
  const anchorPkgPath = path.join(targetRoot, 'dsh', 'package.json')
  if (fs.existsSync(anchorPkgPath)) {
    const anchorPkg = JSON.parse(fs.readFileSync(anchorPkgPath, 'utf8'))
    anchorPkg.dependencies = dshDepsCopied
    fs.writeFileSync(anchorPkgPath, `${JSON.stringify(anchorPkg, null, 2)}\n`)
  }
  if (missingLib.length > 0) {
    console.warn(`\n[sync-dsh] ${missingLib.length} 个闭包含缺 lib/ 构建产物：`)
    missingLib.forEach((n) => console.warn(`  - ${n}`))
  }
  console.log(`\n[sync-dsh] 完成：${copiedCount} 个 @deepseek-ai 包已同步到 node_modules。`)
}

await main()
