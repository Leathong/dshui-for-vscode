/**
 * Remove stale legacy package projections from the dsh profile fallback tree.
 *
 * dsh ≤ 0.1.5's link backend projected the extension's `node_modules` into
 * `$DSH_HOME/profiles/node_modules` as symlinks pointing at whichever extension
 * directory was installed at the time (1.3.0, 1.5.0, 1.8.0, 1.8.2, ...). dsh
 * 0.1.7 resolves bare names through the runtime interception (the installation
 * closure) and no longer maintains those links, so after an upgrade they keep
 * pointing at the previous — often deleted — install:
 *
 *   - a live link to an older version silently shadows the current package
 *     (e.g. 0.1.5's `@deepseek-ai/dsh-client-ui-*` winning over 0.1.7's), and
 *   - a dangling link breaks resolution outright (e.g. a 1.3.0-era
 *     `@deepseek-ai/dsh-client-ui-primitives`).
 *
 * Real directories (the plugins the extension installs there: dshui-client-ui-*,
 * dsh-rollback-plugin, dsh-capability-toggle-plugin, ...) are left untouched, as is every
 * symlink that resolves inside the currently installed extension or points
 * somewhere that is not a dshui extension directory at all (e.g. an npx cache
 * target someone else owns). Removed are exactly: dangling links, and links into
 * a previous dshui install.
 *
 * Safe to re-run: run it again after installing a new vsix so the links to the
 * previous install are dropped too.
 *
 * Usage:
 *   node scripts/clean-profile-links.mjs [--dry-run]
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const EXTENSION_ID = 'leathong.dshui-for-vscode'

const dryRun = process.argv.includes('--dry-run')
const home = os.homedir()
const dshHome = process.env.DSH_HOME ?? path.join(home, '.dsh')
const modules = path.join(dshHome, 'profiles', 'node_modules')
const extensionsRoot = path.join(home, '.vscode', 'extensions')

/** Absolute real path of the installed dshui extension (VS Code's registry first). */
function installedExtension() {
  try {
    const entries = JSON.parse(fs.readFileSync(path.join(extensionsRoot, 'extensions.json'), 'utf8'))
    for (const entry of entries) {
      if (entry?.identifier?.id !== EXTENSION_ID) continue
      const location = entry?.location?.path
      if (typeof location === 'string' && fs.existsSync(path.join(location, 'package.json'))) {
        return fs.realpathSync(location)
      }
    }
  } catch {
    // Fall through to the directory scan (no registry file / not JSON).
  }
  const candidates = []
  try {
    for (const entry of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(`${EXTENSION_ID}-`)) continue
      const dir = path.join(extensionsRoot, entry.name)
      try { candidates.push({ dir, mtime: fs.statSync(dir).mtimeMs }) } catch { /* unreadable dir */ }
    }
  } catch {
    return undefined
  }
  candidates.sort((left, right) => right.mtime - left.mtime)
  return candidates.length === 0 ? undefined : fs.realpathSync(candidates[0].dir)
}

/** Top-level and one-level-scoped symlinks under the fallback tree (never deeper). */
function symlinksUnder(root) {
  const links = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isSymbolicLink()) {
      links.push(full)
      continue
    }
    if (!entry.isDirectory() || !entry.name.startsWith('@')) continue
    for (const child of fs.readdirSync(full, { withFileTypes: true })) {
      if (child.isSymbolicLink()) links.push(path.join(full, child.name))
    }
  }
  return links
}

const install = installedExtension()
if (install === undefined) {
  console.error(`cannot locate the installed ${EXTENSION_ID} extension under ${extensionsRoot}`)
  process.exit(1)
}
if (!fs.existsSync(modules)) {
  console.error(`no profile fallback tree at ${modules} — nothing to do`)
  process.exit(0)
}

const currentPrefix = install + path.sep
/** Any installed dshui version directory: only projections of these are ours to drop. */
const versionPrefix = path.join(extensionsRoot, `${EXTENSION_ID}-`)
const links = symlinksUnder(modules)
const removable = []
let kept = 0
let keptSample = ''

for (const link of links) {
  let real
  try {
    real = fs.realpathSync(link)
  } catch {
    real = undefined // dangling: nothing can load through it
  }
  if (real !== undefined) {
    if ((real + path.sep).startsWith(currentPrefix)) {
      kept += 1
      if (keptSample === '') keptSample = path.relative(modules, link)
      continue
    }
    // A live link that is not an extension projection (e.g. an npx cache
    // target) belongs to someone else: leave it alone.
    if (!(real + path.sep).startsWith(versionPrefix)) {
      kept += 1
      continue
    }
  }
  removable.push({
    link: path.relative(modules, link),
    target: real ?? `(dangling) ${fs.readlinkSync(link)}`,
  })
}

console.log(`dsh home            : ${dshHome}`)
console.log(`installed extension : ${install}`)
console.log(`symlinks found      : ${links.length} (keep ${kept}, remove ${removable.length})`)
if (keptSample !== '') console.log(`keep e.g.           : ${keptSample}`)
for (const item of removable.slice(0, 20)) console.log(`  - ${item.link} -> ${item.target}`)
if (removable.length > 20) console.log(`  ... and ${removable.length - 20} more`)

if (dryRun) {
  console.log('\n--dry-run: nothing changed')
  process.exit(0)
}
for (const item of removable) fs.rmSync(path.join(modules, item.link), { force: true })
console.log(`\nremoved ${removable.length} stale link(s)`)
