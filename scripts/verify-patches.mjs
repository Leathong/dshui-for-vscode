/**
 * 校验 dsh 源码检出（.dsh-src）里的 dshui 补丁是否仍然完整。
 *
 * dsh 升级（或重新检出源码）后运行：`node scripts/verify-patches.mjs`。
 * 逐个检查每个改动文件的关键标记；缺失即说明该补丁需要重新套用。
 * 退出码：全部就位为 0，有缺失为 1。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, '.dsh-src')

/** 每个改动文件需要存在的标记（一项即可视为该文件已补丁）。 */
const CHECKS = [
  {
    file: 'packages/client/ui-workspace/src/client/tree.ts',
    markers: ['export function scopedWorkspacePath', 'scope: string = \'\''],
  },
  {
    file: 'packages/client/ui-workspace/src/client/WorkspaceBrowser.tsx',
    markers: ["const SCOPE = scopedWorkspacePath()", 'SCOPE === \'\' && directoryFlowAvailable', "SCOPE !== '' && !wide ? null", 'onSessionDelete', 'deletedSessionIds'],
  },
  {
    file: 'packages/client/ui-workspace/src/client/contract/slots.ts',
    markers: ['deleteSession: (sessionId: SessionId) => Promise<void>'],
  },
  {
    file: 'packages/client/ui-workspace/src/client/index.ts',
    markers: ["type: 'dshui:deleteSession'", 'requestSessionDelete'],
  },
  {
    file: 'packages/client/ui-workspace/src/client/rows/Rows.tsx',
    markers: ["t('menu.deleteSession')", "onDelete: (id: SessionNode['id']) => void"],
  },
  {
    file: 'packages/client/ui-workspace/src/client/locales.ts',
    markers: ["'menu.deleteSession': '删除会话'"],
  },
  {
    file: 'packages/client/ui-workspace/tests/rows.client.spec.tsx',
    markers: ["name: '删除会话'"],
  },
  {
    file: 'packages/client/ui-workspace/tests/workspace-browser.client.spec.tsx',
    markers: ['deleteSession'],
  },
  {
    file: 'packages/client/ui-workspace/tests/tree.client.spec.ts',
    markers: ["deleted('gone')"],
  },
  {
    file: 'packages/client/ui-workspace/tsdown.config.ts',
    markers: ["clientBundle('dshui-client-ui-workspace'"],
  },
  {
    file: 'packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx',
    markers: ['data-dshui-scope', 'staticChip={SCOPE !== \'\'}'],
  },
  {
    file: 'packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx',
    markers: ['staticChip = false'],
  },
  {
    file: 'packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css',
    markers: ["data-dshui-scope='true'"],
  },
  {
    file: 'packages/client/ui-conversation/src/client/skeleton/HeroShell.module.css',
    markers: ['.workspaceStatic'],
  },
  {
    file: 'packages/client/ui-conversation/tsdown.config.ts',
    markers: ["clientBundle('dshui-client-ui-conversation'"],
  },
]

let failed = 0
if (!fs.existsSync(src)) {
  console.error(`未找到源码检出：${src}`)
  console.error('（源码检出只在重新构建客户端 bundle 时需要，可随时重新 clone：')
  console.error('  git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness.git .dsh-src）')
  process.exit(1)
}
for (const check of CHECKS) {
  const full = path.join(src, check.file)
  if (!fs.existsSync(full)) {
    console.error(`✗ ${check.file} — 文件不存在（该补丁整体缺失）`)
    failed += 1
    continue
  }
  const content = fs.readFileSync(full, 'utf8')
  const missing = check.markers.filter((m) => !content.includes(m))
  if (missing.length === 0) {
    console.log(`✓ ${check.file}`)
  } else {
    console.error(`✗ ${check.file} — 缺少标记: ${missing.join(' | ')}`)
    failed += 1
  }
}
if (failed > 0) {
  console.error(`\n${failed} 处补丁缺失或已漂移，需要重新套用后再构建（见 README「跟随 dsh 版本升级」）。`)
  process.exit(1)
} else {
  console.log('\n全部 dshui 补丁就位，可以直接构建。')
}
