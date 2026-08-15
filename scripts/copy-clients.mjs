/**
 * Copies the built client bundles from the dsh source checkout into the
 * extension's plugin packages. Run after rebuilding the modified packages:
 *
 *   cd .dsh-src && pnpm run build:lib:client
 *   node scripts/copy-clients.mjs
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
  fs.copyFileSync(from, to)
  const size = fs.statSync(to).size
  console.log(`copied ${packageDir} -> ${pluginName}/client.js (${size} bytes)`)
}
