/**
 * Copies the patched client bundles from the dsh source checkout into the
 * extension's `dshui-plugins/` packages. Run after rebuilding the modified
 * packages:
 *
 *   cd .dsh-src && pnpm run build:lib:client
 *   node scripts/copy-clients.mjs
 *
 * The row id and the id the bundle declares with
 * `window.__ModuleLoader__.load({ id })` must match: the client-modules loader
 * keys factories by the declared id, so a bundle built before the tsdown
 * `clientBundle(...)` rename loads under the stock `@deepseek-ai/...` id while
 * the row is addressed as `dshui-...` — the row then fails to load, the
 * `uiWorkspace` / `uiConversation` services never appear, and ~20 dependent
 * client plugins stay PENDING ("Failed to load plugins" for almost the whole
 * UI). The id assertion below turns that silent failure into a build error.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, '.dsh-src', 'packages', 'client')

const copies = [
  ['ui-workspace', 'dshui-client-ui-workspace'],
  ['ui-conversation', 'dshui-client-ui-conversation'],
]

/** The id the bundle registers with `window.__ModuleLoader__.load({ id })`. */
function registeredId(bundle) {
  return /load\(\{\s*id:\s*"([^"]+)"/.exec(bundle)?.[1]
}

for (const [packageDir, pluginName] of copies) {
  const from = path.join(src, packageDir, 'lib', 'client.js')
  const to = path.join(root, 'dshui-plugins', pluginName, 'client.js')
  if (!fs.existsSync(from)) {
    if (!fs.existsSync(path.join(root, '.dsh-src'))) {
      // 全新克隆没有 .dsh-src（不入库）：使用随包提交的预编译 bundle，跳过即可。
      console.warn(`skipping ${pluginName}: no .dsh-src checkout (using the committed dshui-plugins bundle)`)
      continue
    }
    console.error(`missing built bundle: ${from} (run pnpm run build:lib:client in .dsh-src first)`)
    process.exit(1)
  }
  const bundle = fs.readFileSync(from)
  const id = registeredId(bundle.toString('utf8'))
  if (id !== pluginName) {
    console.error(
      `bundle id mismatch: ${from} registers "${String(id)}" but its row loads it as "${pluginName}".\n`
      + '  Rebuild the client packages (`pnpm run build:lib:client` in .dsh-src) — a stale build still\n'
      + '  carries the upstream bundle id, which makes the row unloadable and strands every plugin\n'
      + '  waiting on the services it provides.',
    )
    process.exit(1)
  }
  fs.writeFileSync(to, bundle)
  const size = bundle.length
  console.log(`copied ${packageDir} -> ${pluginName}/client.js (${size} bytes, id ${pluginName})`)
}
