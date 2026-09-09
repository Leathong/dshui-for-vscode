# dshui 源码补丁

> 中文 · [English](README.en.md)

`dshui-bundles.patch` 是对 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 源码的
dshui 改动（45 个文件，含客户端 bundle + host 运行时两大部分）。客户端与 host 必须**对齐**到同一
基提交并一起套用，因此合并为单个补丁——套一半都是不完整的。

## 客户端 bundle（浏览器 SPA）

- `ui-workspace`：`tree.ts`（scopedWorkspacePath 与各 derive 的 scope 参数、
  本地删除会话隐藏集）、`WorkspaceBrowser.tsx`（SCOPE 常量、workspaces/ungrouped
  过滤、隐藏添加/视图选项、会话删除行隐藏）、`contract/slots.ts`（`archiveSession`
  改为 `deleteSession`）、`index.ts`（会话删除经 webview 外壳请求扩展宿主删除日志文件）、
  `rows/Rows.tsx`（会话菜单「删除会话」/垃圾桶图标/danger 样式、`onArchive` 改为 `onDelete`）、
  `locales.ts`（`menu.archiveSession` 改为 `menu.deleteSession`）、
  `tsdown.config.ts`（bundle id 改为 `dshui-client-ui-workspace`）；
- `ui-conversation`：`apply.ts`（共享后端第二个窗口再入会话时 `conversation` 服务可能读到
  `undefined`——旧实现会 throw 并一次性让出 composer 槽位（无重试），直到窗口重载 composer 永久
  消失；改为降级到「无态回复」姿态，下一次绑定重解就恢复活跃 composer）、`ConversationRoot.tsx`
  （SCOPE 常量、静态 chip、hero 隐藏、`data-dshui-scope`）、`EmptyHero.tsx`（WorkspaceChip 的
  staticChip prop）、`ConversationRoot.module.css`（scoped hero 贴底、settling 阶段保留输入框）、
  `HeroShell.module.css`（`.workspaceStatic`）、`tsdown.config.ts`（bundle id 改为
  `dshui-client-ui-conversation`）；
- `ui-chat`（0.1.2 起上游把会话/聊天客户端拆成独立包）：`chat/MessageItem.tsx`（用户消息渲染器
  拆成 `UserMessageNodeView` 与 `SteeringMessageNodeView`；用户消息内嵌一个锚定到其 Turn 的
  `conversation.chat.user-actions` 操作条，steering 消息不含；并在上游对 `projectUserText` 的
  引用 chip 投影之上**保留 markdown 链接投影**：`[label](destination)` 中白名单
  http/https/mailto 渲染为外链锚点，`new URL` 无法解析的目标渲染为经 `openFile` 按会话 cwd
  解析打开的文件按钮，其余绝对 URL 保持字面）、`chat/MessageItem.module.css`（`.projectedText`
  内联流动与 `.link` 链接样式）、`chat/ChatView.tsx`（向 pending steering / submission 气泡传入
  `openFile`）、`chat/register-node-renderers.ts`（为 `user` 注册 `UserMessageNodeView`（带
  user-actions 子槽）、为 `steering` 注册 `SteeringMessageNodeView`）、`contract/slots.ts`
  （`UserActionOwnerProps` 与 `conversation.chat.user-actions` 槽声明）、
  `tests/chat-branch-tails.client.spec.tsx` 与 `tests/chat-view.client.spec.tsx`（user-actions
  锚定 Turn 打开、steering 无该槽、markdown 链接外链可点/相对路径经 openFile 打开/外链白名单外
  保持字面）；
- `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`：登记
  `conversation.chat.user-actions` 槽的目录条目（供聊天界面「槽目录」文档展示）。
- 构建预设：`packages/client/tsdown.client.ts`（`workspaceManifest` 对 `dshui-client-*` bundle id
  按包目录回退——rc.1 起 tsdown 按包名校验 bundle id，而 dshui id 是 profile 行名）。

效果：侧边栏只列出当前工作区会话、输入框始终贴底（无居中 hero）、会话菜单为「删除会话」
（由扩展宿主用 VS Code 文件 API 删除 `$DSH_HOME/sessions/...` 下的会话日志，不走 dsh 的
归档 RPC）、每条用户消息附一个可扩展的操作条（`conversation.chat.user-actions`，扩展用它挂
「回滚」）、用户消息中的 markdown 链接可点击（外链经系统浏览器打开，相对路径在当前窗口打开
对应文件）。聊天中的文件链接在宿主 VS Code 打开（darwin 本地 open bridge → `code` CLI →
`vscode://file`，无系统弹窗——host 侧见下文）。运行时用的是 `../dshui-plugins/*/client.js` 的
**预编译产物**；本补丁用于从源码复现这些产物。补丁同时包含上述改动的测试文件（`tests/` 下四个 spec）。

## host 运行时（服务器侧）

把扩展此前在运行时对 npm 包的字符串 patch（见已删除的 `src/openPatch.ts`）固化到源码并在编译期烘焙：

- `packages/util/native-command/src/path-opener.ts`：`openNativePathWithIntent` 的 darwin 分支改为
  依次尝试「本地 open bridge → `code` CLI → `vscode://file`」，并新增配套的 bridge/CLI/URL 辅助函数
  （`dshuiOpenViaBridge` / `dshuiOpenViaCli` / `dshuiVscodeFileUrl` / origin 感知的 bridge 选择），
  使聊天中的文件链接在宿主 VS Code 打开（走扩展内桥接，无系统弹窗）；`PathOpenerInternals` 增加
  `dshuiOrigin` 让点击来源参与路由。
- `packages/client/connection/src/browser-auth.ts`：token 交换的 303 重定向在保留 launch 之外的
  `dshui_workspace` / `dshui_theme` 查询参数，避免共享后端窗口在 token 交换后丢失工作区作用域。

这两个包由扩展的 `scripts/sync-dsh.mjs` 以**源码编译产物**填充 `node_modules/@deepseek-ai/*`，
而不再从 npm 下载。根 `package.json` 只声明**一个**锚点依赖 `@deepseek-ai/dsh`（其余 `@deepseek-ai/*`
是其清单里的传递依赖，`npm list` 因此认可整个闭包，却又不会去 registry 拉取——源码产物提前就位）。
运行时读取的是 `node_modules/@deepseek-ai/*` 中的**预编译产物**；本补丁用于从源码复现这些产物。

## 应用（必须锁定基提交）

补丁针对的基提交（**固定，不能漂移**）：

```
5dda764ed3aa172535a7967b06ff95d9cbfe536a
```

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
cd .dsh-src
git fetch origin 5dda764ed3aa172535a7967b06ff95d9cbfe536a && git checkout FETCH_HEAD
git apply ../patches/dshui-bundles.patch            # 基提交不匹配会安全失败
pnpm install                                        # 需要 pnpm 11.7.0、Node ^22.19 || >=24
pnpm run build:lib:host
pnpm run build:lib:client
cd ..
node scripts/copy-clients.mjs                       # 客户端 bundle 拷入 dshui-plugins/
node scripts/sync-dsh.mjs                           # @deepseek-ai/* 源码产物拷入 node_modules
npm run compile
```

## 上游漂移时

`git apply` 失败即说明基提交已漂移——按 [README「跟随 dsh 版本升级」](../README.md#跟随-dsh-版本升级)
一节的清单逐个重套（改动都很小，按文件内注释即可）。dsh 是 MIT 协议，本补丁与其产物可自由
修改/分发，保留上游版权声明即可。
