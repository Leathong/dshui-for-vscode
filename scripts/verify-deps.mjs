/**
 * 校验扩展根 `package.json` 声明了 dsh 运行时闭包需要的全部第三方依赖。
 *
 * 背景：`@deepseek-ai/*` 由 `sync-dsh.mjs` 从 `.dsh-src` 源码产物填入
 * `node_modules`，它们的 `package.json` 依赖表会被清空（见 sync-dsh 注释），
 * 因此闭包里**非** `@deepseek-ai/*` 的依赖只能由根 `package.json` 负责安装。
 * 升级 dsh 后若上游新增/提高了这类依赖，缺一个就会在启动时报
 * `failed to import`，而构建期完全无声——0.1.7 升级时 `plugin-manager`
 * （缺 execa）、`mcp-client`（缺 @modelcontextprotocol/client）、
 * `office-to-pdf`（缺 @deepseek-ai/libreoffice-kit）、`llm-pi-ai`
 * （pi-ai 版本过低）就是这样在浏览器里表现为「插件加载失败 / 创造模式预设无法加载」。
 *
 * 两种强度：
 *   - declared：只要求根清单里有声明（`preinstall` 阶段依赖尚未落盘，只能查这个）；
 *   - installed：还要求已安装版本不低于上游要求的版本下限（打包 / 安装后查）。
 *
 * 用法：`node scripts/verify-deps.mjs [--installed]`；退出码 0 = 通过，1 = 有缺口。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { meetsSpec, scanClosure } from './lib/dsh-closure.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, '.dsh-src')

/** 读取已安装的版本；未安装返回 undefined（不解析 `exports`，直接读清单）。 */
function installedVersion(name) {
  const manifest = path.join(root, 'node_modules', name, 'package.json')
  try {
    return JSON.parse(fs.readFileSync(manifest, 'utf8')).version
  } catch {
    return undefined
  }
}

/**
 * 计算依赖缺口。
 * @param checkInstalled - 是否连已安装版本一起校验。
 * @returns `{ missing, stale }`：未声明项与已安装但过低的项。
 */
export function findDependencyGaps(checkInstalled) {
  const { external } = scanClosure(src)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const declared = manifest.dependencies ?? {}
  const missing = []
  const stale = []
  for (const [name, { spec, from }] of [...external].sort(([a], [b]) => a.localeCompare(b))) {
    const range = declared[name]
    if (range === undefined) {
      missing.push({ name, spec, from })
      continue
    }
    if (!checkInstalled) continue
    const version = installedVersion(name)
    if (version === undefined) {
      missing.push({ name, spec, from, reason: '未安装' })
    } else if (!meetsSpec(version, spec)) {
      stale.push({ name, spec, from, version })
    }
  }
  return { missing, stale }
}

/**
 * 校验并在有缺口时抛出。
 * @param checkInstalled - 是否连已安装版本一起校验。
 */
export function assertDependencies(checkInstalled) {
  const { missing, stale } = findDependencyGaps(checkInstalled)
  if (missing.length === 0 && stale.length === 0) return
  const lines = [
    '[verify-deps] 根 package.json 未覆盖 dsh 运行时闭包的第三方依赖：',
  ]
  for (const item of missing) {
    lines.push(`  缺少声明  ${item.name}  需要 ${item.spec}（${item.from}）${item.reason === undefined ? '' : ` — ${item.reason}`}`)
  }
  for (const item of stale) {
    lines.push(`  版本过低  ${item.name}  已安装 ${item.version}，需要 ${item.spec}（${item.from}）`)
  }
  lines.push('  修复：把上面每一项按需要的版本加进 package.json 的 dependencies 后重新 npm install。')
  throw new Error(lines.join('\n'))
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const checkInstalled = process.argv.includes('--installed')
  try {
    assertDependencies(checkInstalled)
    console.log(`[verify-deps] 第三方依赖闭包完整${checkInstalled ? '（含已安装版本）' : ''}`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
