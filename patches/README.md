# dshui 客户端 bundle 补丁

> 中文 · [English](README.en.md)

`dshui-client-bundles.patch` 是对 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
客户端源码的 dshui 修改（20 个文件，两个包）：

- `ui-workspace`：`tree.ts`（scopedWorkspacePath 与各 derive 的 scope 参数、
  本地删除会话隐藏集）、`WorkspaceBrowser.tsx`（SCOPE 常量、workspaces/ungrouped
  过滤、隐藏添加/视图选项、会话删除行隐藏）、`contract/slots.ts`（`archiveSession`
  改为 `deleteSession`）、`index.ts`（会话删除经 webview 外壳请求扩展宿主删除日志文件）、
  `rows/Rows.tsx`（会话菜单「删除会话」/垃圾桶图标/danger 样式、`onArchive` 改为 `onDelete`）、
  `locales.ts`（`menu.archiveSession` 改为 `menu.deleteSession`）、
  `tsdown.config.ts`（bundle id 改为 `dshui-client-ui-workspace`）；
- `ui-conversation`：`apply.ts`（`host.openPath` 附带点击来源 `dshuiOrigin`，嵌套工作区文件在
  点击窗口打开）、`ConversationRoot.tsx`（SCOPE 常量、静态 chip、hero 隐藏、`data-dshui-scope`）、
  `EmptyHero.tsx`（WorkspaceChip 的 staticChip prop）、`ConversationRoot.module.css`（scoped hero
  贴底）、`HeroShell.module.css`（`.workspaceStatic`）、`chat/MessageItem.tsx`（用户/steering
  气泡的 `[label](destination)` markdown 链接投影：白名单 http/https/mailto 渲染为外链锚点，
  `new URL` 无法解析的目标渲染为经 `openFile` 按会话 cwd 解析打开的文件按钮，其余绝对 URL
  保持字面；装饰段内联流动）、`chat/ChatView.tsx`（向 `PendingSteeringBubble` 传入 `openFile`）、
  `chat/MessageItem.module.css`（`.projectedText` 内联投影与 `.link` 链接样式）、
  `tsdown.config.ts`（bundle id 改为 `dshui-client-ui-conversation`）。

效果：侧边栏只列出当前工作区会话、输入框始终贴底（无居中 hero）、会话菜单为「删除会话」
（由扩展宿主用 VS Code 文件 API 删除 `$DSH_HOME/sessions/...` 下的会话日志，不走 dsh 的
归档 RPC），用户消息中的 markdown 链接可点击（外链经系统浏览器打开，相对路径在当前窗口
打开对应文件）。运行时用的是 `../dshui-plugins/*/client.js` 的**预编译产物**；本补丁用于从源码
复现这些产物。补丁同时包含上述改动的测试文件（`tests/` 下四个 spec）。

## 应用（必须锁定基提交）

补丁针对的基提交（**固定，不能漂移**）：

```
99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
```

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
cd .dsh-src
git fetch origin 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca && git checkout FETCH_HEAD
git apply ../patches/dshui-client-bundles.patch     # 基提交不匹配会安全失败
pnpm install                                        # 需要 pnpm 11.7.0、Node ^22.19 || >=24
pnpm run build:lib:host
pnpm run build:lib:client
cd ..
node scripts/copy-clients.mjs                       # 新 bundle 拷入 dshui-plugins/
npm run compile
```

## 上游漂移时

`git apply` 失败即说明基提交已漂移——按 [README「跟随 dsh 版本升级」](../README.md#跟随-dsh-版本升级)
一节的清单逐个重套（改动都很小，按文件内注释即可）。dsh 是 MIT 协议，本补丁与其产物可自由
修改/分发，保留上游版权声明即可。
