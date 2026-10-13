/**
 * 校验 dsh 源码检出（.dsh-src）里的 dshui 补丁是否仍然完整。
 *
 * dsh 升级（或重新检出源码）后运行：`node scripts/verify-patches.mjs`。
 * 逐个检查每个改动文件的关键标记；缺失即说明该补丁需要重新套用。
 * 退出码：全部就位为 0，有缺失为 1。
 *
 * 注意：0.1.7 起上游把会话行操作改成 slot 目录（`sidebar.workspaces.session.menu.item`
 * 与 `...row.action`），dshui 的「删除会话」因此落在
 * `ui-workspace/src/client/session-actions/DeleteSession.tsx`，Rows.tsx 本身不再改。
 * 会话界面的 SCOPE 逻辑也随之从 ConversationRoot.tsx 拆到
 * `ui-conversation/src/client/skeleton/dshui-scope.ts` 与 ConversationContent.tsx。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, '.dsh-src')

/** 每个改动文件需要存在的标记（全部命中才视为该文件已补丁）。 */
const CHECKS = [
  {
    file: 'packages/client/tsdown.client.ts',
    markers: ["id.startsWith('dshui-client-')"],
  },
  {
    file: 'packages/client/ui-workspace/src/client/tree.ts',
    markers: ['export function scopedWorkspacePath', 'deletedSessionIds', 'scope: string'],
  },
  {
    file: 'packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx',
    markers: ['scopedWorkspacePath', 'useDeletedSessions', 'deletedSessionIds'],
  },
  {
    file: 'packages/client/ui-workspace/src/client/contract/slots.ts',
    markers: ['DeleteSessionInjected', 'deletedSessions: HostObservable'],
  },
  {
    file: 'packages/client/ui-workspace/src/client/index.ts',
    markers: ["type: 'dshui:deleteSession'", "window.parent.postMessage({ type: 'dshui:deleteSession', sessionId, cwd }"],
  },
  {
    file: 'packages/client/ui-workspace/src/client/session-actions/DeleteSession.tsx',
    markers: ["t('menu.deleteSession')", 'deleteSession(sessionId)'],
  },
  {
    file: 'packages/client/ui-workspace/src/client/locales.ts',
    markers: ["'menu.deleteSession': '删除会话'"],
  },
  {
    file: 'packages/client/ui-workspace/tsdown.config.ts',
    markers: ["clientBundle('dshui-client-ui-workspace'"],
  },
  {
    file: 'packages/client/ui-conversation/src/client/skeleton/dshui-scope.ts',
    markers: ['export const DSHUI_SCOPE'],
  },
  {
    file: 'packages/client/ui-conversation/src/client/skeleton/ConversationMainPanel.tsx',
    markers: ['data-dshui-scope'],
  },
  {
    file: 'packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx',
    markers: ["staticChip={DSHUI_SCOPE !== ''}", "DSHUI_SCOPE === '' && renderSlot('conversation.hero.workspace'"],
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
  {
    file: 'packages/util/native-command/src/path-opener.ts',
    markers: ['dshuiOpenViaBridge', 'dshuiVscodeFileUrl', 'dshuiOpenViaCli', 'dshuiLine'],
  },
  {
    file: 'packages/client/connection/src/browser-auth.ts',
    markers: ['function indexLocation(url: URL): string', "'location': indexLocation(url),"],
  },
  {
    file: 'packages/client/ui-conversation/src/client/apply.ts',
    markers: ['const absent = (): ComposerBarInjected'],
  },
  {
    file: 'packages/client/ui-chat/src/client/chat/MessageItem.tsx',
    markers: ['userLinkDestination', 'projectUserTextWithLinks', 'filePathAndLine', "renderSlot('conversation.chat.user-actions'"],
  },
  {
    file: 'packages/client/ui-chat/src/client/chat/MessageItem.module.css',
    markers: ['.projectedText', '.link {'],
  },
  {
    file: 'packages/client/ui-chat/src/client/chat/ChatView.tsx',
    markers: ['openFile={requestOpenFile}'],
  },
  {
    file: 'packages/client/ui-chat/src/client/chat/register-node-renderers.ts',
    markers: ['SteeringMessageNodeView', "'conversation.chat.user-actions'"],
  },
  {
    file: 'packages/client/ui-chat/src/client/contract/slots.ts',
    markers: ["'conversation.chat.user-actions'", 'UserActionOwnerProps'],
  },
  {
    file: 'packages/client/ui-chat/src/client/apply.ts',
    markers: ['dshuiClickOrigin', 'dshuiOpenPath', 'dshuiLine: options.line'],
  },
  {
    file: 'packages/client/ui-settings-general/src/client/settings-document-store.ts',
    markers: ['dshuiClickOrigin'],
  },
  {
    file: 'packages/extensions/cordis-client-runner/src/client/slot-catalog.ts',
    markers: ["'conversation.chat.user-actions'"],
  },
  {
    file: 'packages/api/session-controller/src/commands.ts',
    markers: ['child.agent.inbox.clear()'],
  },
  {
    file: 'packages/api/session-controller/src/index.ts',
    markers: ['dshuiOrigin', 'dshuiHomePath', 'dshuiLine'],
  },
  {
    file: 'packages/api/settings-controller/src/index.ts',
    markers: ['dshuiOrigin'],
  },
  {
    file: 'packages/mcp/mcp-client/src/index.ts',
    markers: ["startup: 'eager' | 'lazy'", "config.startup === 'eager'"],
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
