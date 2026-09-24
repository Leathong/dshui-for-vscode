/**
 * 打包前校验 `patch.yml`（扩展下发的 cordis 组合补丁）的两条不变量。
 *
 * dsh 的加载器按行挂载组合：本文件 disable 掉的行会从整棵树消失，它原本提供
 * 的服务必须由某个 insert 出来的行接手。这个「停用 + 替换」的唯一实例是沙箱
 * 缝隙：`bash-sandbox` / `fs-sandbox` 是 `shell` / `fs` 两个服务的唯一提供者，
 * `dsh-whitelist-sandbox` 用白名单子类提供同样的两个服务。只停用不替换时，
 * 服务端会正常启动，但所有 shell/fs 消费者永远 PENDING（会话列表加载不出来、
 * 设置页报错、插件面板显示 `waiting for shell` / `waiting for fs`）——构建期
 * 完全无声，只有在浏览器里才看得见，所以在打包这一步拦住它。
 *
 * 另一条：insert 出来的行必须指向扩展真的随包分发的插件目录
 * （`dshui-plugins/<name>`）；指向不存在的包只会在启动时报 failed to import。
 *
 * 用法：`node scripts/verify-overlay.mjs [patch.yml 路径]`（缺省为本仓库的
 * patch.yml；显式路径用于校验候选补丁）。退出码 0 = 全部满足，1 = 有违反项
 * （逐条打印）。
 *
 * 这里按行扫描而不引入 YAML 解析：patch.yml 是手写的小文件，且 dsh 允许行内
 * `!!js` 表达式，行扫描对两者都稳定。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const patchPath = path.resolve(root, process.argv[2] ?? 'patch.yml')
const pluginsDir = path.join(root, 'dshui-plugins')

/** 沙箱服务提供者：停用任一个就必须插入替换行，反之亦然。 */
const SANDBOX_PROVIDERS = ['bash-sandbox', 'fs-sandbox']
/** 提供 `shell` 与 `fs` 的替换行（dshui 白名单沙箱）。 */
const SANDBOX_REPLACEMENT = 'dsh-whitelist-sandbox'

/**
 * 扫描 patch.yml，取出顶层行与 insert 行。
 * @param text - patch.yml 的完整内容。
 * @returns `{ rows, inserts }`，每项含 `id`、`name`（缺省等于 id）与 `disabled`。
 */
function scanRows(text) {
  const rows = []
  const inserts = []
  let row
  let insert
  for (const line of text.split('\n')) {
    const bare = line.replace(/\s+#.*$/, '')
    if (bare.trim() === '') continue
    const indent = bare.length - bare.trimStart().length
    const body = bare.trim()
    if (/^-\s*insert:\s*$/.test(body)) {
      insert = true
      continue
    }
    const item = /^-\s*id:\s*(.+?)\s*$/.exec(body)
    if (item !== null) {
      const target = { id: item[1], name: item[1], disabled: false }
      if (indent === 0) {
        row = target
        rows.push(target)
        insert = false
      } else {
        row = undefined
        if (!insert) throw new Error(`patch.yml: insert 块外的缩进行 id: ${item[1]}`)
        inserts.push(target)
      }
      continue
    }
    const named = /^name:\s*(.+?)\s*$/.exec(body)
    if (named !== null) {
      if (row !== undefined && indent === 2) row.name = named[1].replace(/^['"]|['"]$/g, '')
      else if (insert && indent === 6) inserts.at(-1).name = named[1].replace(/^['"]|['"]$/g, '')
      continue
    }
    if (/^disabled:\s*true\s*$/.test(body)) {
      if (row !== undefined && indent === 2) row.disabled = true
    }
  }
  return { rows, inserts }
}

const text = fs.readFileSync(patchPath, 'utf8')
const { rows, inserts } = scanRows(text)
const violations = []

const disabled = new Set(rows.filter((entry) => entry.disabled).map((entry) => entry.id))
const replacement = inserts.find(
  (entry) => entry.name === SANDBOX_REPLACEMENT || entry.id === SANDBOX_REPLACEMENT,
)
const strippedProviders = SANDBOX_PROVIDERS.filter((id) => disabled.has(id))

if (strippedProviders.length > 0 && replacement === undefined) {
  violations.push(
    `停用了 ${strippedProviders.join(' + ')} 但没有插入 ${SANDBOX_REPLACEMENT} 行：`
    + 'shell/fs 服务将无人提供，tool-bash、tool-fs、present、permission、'
    + 'session-controller 等全部停在 PENDING（会话列表、设置页、插件面板都会报错）。',
  )
}
if (replacement !== undefined && strippedProviders.length !== SANDBOX_PROVIDERS.length) {
  violations.push(
    `插入了 ${SANDBOX_REPLACEMENT} 但没有停用全部 ${SANDBOX_PROVIDERS.join(' + ')}：`
    + '同一个 shell/fs 服务会被注册两次，加载器在挂载时抛错。',
  )
}

for (const entry of inserts) {
  if (!fs.existsSync(path.join(pluginsDir, entry.name))) {
    violations.push(
      `insert 行 ${entry.id} 指向 dshui-plugins/${entry.name}，该插件目录不存在`
      + '（启动时会 failed to import）。',
    )
  }
}

// 沙箱替换行必须由插件的 profile bundle patch 自行「停用 + 插入」：它必须在
// 第 1 层（bundle），设置页写的 profile patch 是第 2 层；若由 --patch overlay
// （第 4 层）插入，configEditor 在第 2 层匹配不到该行，每次保存都会被判为
// "overridden by a home patch or command-line overlay"。
const bundlePatchPath = path.join(pluginsDir, SANDBOX_REPLACEMENT, 'cordis.patch.yml')
let bundleReplacement
if (!fs.existsSync(bundlePatchPath)) {
  violations.push(
    `缺少 bundle patch dshui-plugins/${SANDBOX_REPLACEMENT}/cordis.patch.yml：`
    + '沙箱「停用 + 替换」配对无人负责（设置页也无法编辑该行）。',
  )
} else {
  const bundle = scanRows(fs.readFileSync(bundlePatchPath, 'utf8'))
  const bundleDisabled = new Set(bundle.rows.filter((entry) => entry.disabled).map((entry) => entry.id))
  const bundleStripped = SANDBOX_PROVIDERS.filter((id) => bundleDisabled.has(id))
  bundleReplacement = bundle.inserts.find(
    (entry) => entry.name === SANDBOX_REPLACEMENT || entry.id === SANDBOX_REPLACEMENT,
  )
  if (bundleStripped.length !== SANDBOX_PROVIDERS.length || bundleReplacement === undefined) {
    violations.push(
      `bundle patch dshui-plugins/${SANDBOX_REPLACEMENT}/cordis.patch.yml 必须同时停用全部 `
      + `${SANDBOX_PROVIDERS.join(' + ')} 并插入 ${SANDBOX_REPLACEMENT}`
      + `（当前停用 ${bundleStripped.join(' + ') || '无'}，插入 ${bundleReplacement === undefined ? '无' : SANDBOX_REPLACEMENT}）。`,
    )
  }
}

if (violations.length > 0) {
  console.error(`patch.yml: ${violations.length} 项违反不变量`)
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}
console.log(
  `patch.yml: 组合校验通过（${rows.length} 个顶层行 / ${inserts.length} 个 insert；`
  + `沙箱服务：overlay ${replacement === undefined ? '不干预' : SANDBOX_REPLACEMENT}，`
  + `bundle ${bundleReplacement === undefined ? '缺失' : SANDBOX_REPLACEMENT}）`,
)
