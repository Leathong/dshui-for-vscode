# dshui 源码补丁

> 中文 · [English](README.en.md)

`dshui-bundles.patch` 是对 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 源码的
dshui 改动（59 个文件、约 195 KB，含客户端 bundle + host 运行时两大部分，基提交为 dsh `0.2.1-rc.3`）。
客户端与 host 必须**对齐**到同一基提交并一起套用，因此合并为单个补丁——套一半都是不完整的。

## 客户端 bundle（浏览器 SPA）

- `ui-workspace`：`tree.ts`（`scopedWorkspacePath`，以及各 derive 的 `scope` 与
  `deletedSessionIds` 参数、按 cwd 的 scope 过滤、本地删除隐藏集）、`WorkspaceBrowser.tsx`
  （`scopedWorkspacePath` / `useDeletedSessions` 接线、会话删除行隐藏）、
  `contract/slots.ts`（`DeleteSessionInjected` 与 `deletedSessions` 可观察量）、`index.ts`
  （dshui 的 deleted-sessions snapshot store + `deleteSession`：经 webview 外壳请求扩展宿主
  删除会话日志，并把 id 记入本地隐藏集）、`session-actions/DeleteSession.tsx`（0.1.7 起上游把会话
  行操作改为 slot 目录：本文件把「删除会话」注册进 `sidebar.workspaces.session.menu.item`（order
  460，排在 rc.2 新增的「复制 Session ID」450 之后）与 `sidebar.workspaces.session.row.action`（order 300），
  与上游的 archive/pin 并存）、
  `locales.ts`（新增 `menu.deleteSession` / `actions.delete`）、
  `tsdown.config.ts`（bundle id 改为 `dshui-client-ui-workspace`）；
- `ui-conversation`：`apply.ts`（共享后端第二个窗口再入会话时 `conversation` 服务可能读到
  `undefined`——旧实现会 throw 并一次性让出 composer 槽位（无重试），直到窗口重载 composer 永久
  消失；改为降级到「无态回复」姿态，下一次绑定重解就恢复活跃 composer）、
  `skeleton/dshui-scope.ts`（0.1.7 起上游把会话界面拆成 ConversationRoot/MainPanel/Content，
  SCOPE 常量因此独立成模块：`DSHUI_SCOPE`）、`skeleton/ConversationMainPanel.tsx`
  （`data-dshui-scope` 根标记）、`skeleton/ConversationContent.tsx`（静态 chip、hero 隐藏、
  scope 下输入框恒不 inert）、`skeleton/EmptyHero.tsx`（WorkspaceChip 的 `staticChip` prop）、
  `ConversationRoot.module.css`（scoped hero 贴底、settling 阶段保留输入框）、
  `HeroShell.module.css`（`.workspaceStatic`）、`tsdown.config.ts`（bundle id 改为
  `dshui-client-ui-conversation`）；
- `ui-chat`：`chat/MessageItem.tsx`（用户消息渲染器拆成 `UserMessageNodeView` 与
  `SteeringMessageNodeView`；用户消息在 IconActions 行内渲染锚定到其 Turn 的
  `conversation.chat.user-actions` 操作条，steering 消息不含。rc.2 起上游把用户消息正文改成
  工厂槽（`conversation.chat.user.content`）→ 纯文本槽（`conversation.user.text` →
  `conversation.user.text.node`）两层结构，链接投影因此改挂到纯文本层）——
  `chat/user-link-rule.ts`（`link` 规则：`[label](destination)` 中白名单 http/https/mailto 交渲染器
  出外链，`new URL` 无法解析的目标解析成文件按钮；`#L10` / `:10` 后缀（含 `-L20`、`–` 区间写法，
  取首行）由 `filePathAndLine` 剥离成打开手势的 `line`；其余绝对 URL 不认领，保持字面）、
  `chat/UserLink.tsx`（外链用锚点，文件用按钮并经注入的 `openFile` 打开）、
  `chat/register-user-links.ts`（把规则注册到 `uiConversation.userText`，把 `link` 渲染器注册进
  `conversation.user.text.node`；`openFile` 走 `remote.session.openWorkspacePath`，带
  `dshuiOrigin` / `dshuiLine`）、`dshui-open.ts`（`dshuiClickOrigin` / `dshuiOpenPath`，与
  `apply.ts` 的 ChatView `openFile` 共用）、`apply.ts`（`openFile` 改为经 Host 在 VS Code 打开，
  取代上游的右侧预览 `dsh-resource://` 地址）、`chat/MessageItem.module.css`（`.link` 链接样式）、
  `chat/register-node-renderers.ts`（`user` 注册声明 `conversation.chat.user-actions` 子槽）、
  `contract/slots.ts`（`UserActionOwnerProps` 与 `conversation.chat.user-actions` 槽声明）、
  `tests/user-link.client.spec.tsx`（规则 + 渲染器 + 目标分类的用例）与其余测试的少量配套改动；
- `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`：由
  `pnpm run gen-client-catalog` 重新生成，登记 `conversation.chat.user-actions` 槽的目录条目
  （供聊天界面「槽目录」文档展示）。
- 构建预设：`packages/client/tsdown.client.ts`（rc.2 起 `clientBundle(packageDir, …)` 从包目录读
  `package.json` 的 name 作为 bundle id；dshui 的 profile 行名不是包名，因此新增 `pluginId` 选项，
  两个 `tsdown.config.ts` 用它把 id 钉回 `dshui-client-*`）。

效果：侧边栏只列出当前工作区会话、输入框始终贴底（无居中 hero）、会话菜单提供「删除会话」
（由扩展宿主用 VS Code 文件 API 删除 `$DSH_HOME/sessions/...` 下的会话日志，不走 dsh 的归档
RPC；上游 0.1.7 新增的归档/置顶行操作保留并存）、每条用户消息附一个可扩展的操作条
（`conversation.chat.user-actions`，扩展用它挂「回滚」）、用户消息中的 markdown 链接可点击
（外链经系统浏览器打开，相对路径在当前窗口打开对应文件）。聊天中的文件链接在宿主 VS Code 打开
（darwin 本地 open bridge → `code` CLI → `vscode://file`，无系统弹窗——host 侧见下文）。运行时
用的是 `../dshui-plugins/*/client.js` 的**预编译产物**；本补丁用于从源码复现这些产物。

> 0.1.7 起上游重写了会话树/行操作/会话界面骨架，dshui 的测试侧改动相应缩减：客户端 patch 主要
> 落在上面的源码文件，测试只保留为编译与既有断言所必需的少量调整（`useDeletedSessions` 桩、
> `SteeringMessageNodeView` 分支等）。

## host 运行时（服务器侧）

把扩展此前在运行时对 npm 包的字符串 patch（见已删除的 `src/openPatch.ts`）固化到源码并在编译期烘焙：

- `packages/util/native-command/src/path-opener.ts`：`openNativePathWithIntent` 的 darwin 分支在
  **扩展宿主标记存在时**（`DSHUI_OPEN_ENDPOINT` / `DSHUI_BRIDGES_FILE` / `DSHUI_CODE_CLI` 任一被注入，
  扩展启动服务器时必然注入）依次尝试「本地 open bridge → `code` CLI → `vscode://file`」，并新增配套的
  bridge/CLI/URL 辅助函数（`dshuiOpenViaBridge` / `dshuiOpenViaCli` / `dshuiVscodeFileUrl` / origin
  感知的 bridge 选择），使聊天中的文件链接在宿主 VS Code 打开（走扩展内桥接，无系统弹窗）；没有这些
  标记的普通 `dsh` 部署保持上游原行为（`open [path]` / 文本意图 `open -t [path]`）。`PathOpenerInternals`
  增加 `dshuiOrigin` 让点击来源参与路由，增加 `dshuiLine` 把链接的行号透传成桥接请求的 `line`
  查询参数（扩展的 openBridge 用它做 `showTextDocument` 选区）；`code` CLI 与 `vscode://file` 回退
  只按文件寻址，没有行号语法，故只有桥接这一路消费行号。0.2.x 起 `runNativeCommand` 的第 4 个参数
  `window: 'hidden' | 'visible'` 变为**必填**，dshui 的 CLI 回退调用补上 `'hidden'`（上游也把 darwin
  分支三处 `open` 调用都改成了显式 `'hidden'`）；漏传是 0.2.1 重基时唯一的编译错误
  （`error TS2554: Expected 4 arguments, but got 3`）。
- `packages/client/connection/src/browser-auth.ts`：索引的两条 303 重定向（token 交换、以及「cookie
  已认证但 token 不匹配」）都保留除 launch token 之外的 `dshui_workspace` / `dshui_theme` 查询参数
  （上游 0.1.7 起改为目录相对的裸 `./`，会把作用域一起丢掉），避免共享后端窗口的 token 失配时静默
  落到服务器自己的工作目录。rc.2 新增 `/connect` 的 API operator cookie 交换，该调用点同样经过 dshui
  的 `sessionCookie(…, crossSite, secure)`：内嵌 iframe 里连自身 fetch 也是跨站上下文，漏掉 `crossSite`
  会让 cookie 被浏览器丢弃。
- `packages/api/session-controller/src/commands.ts`：`session.fork` 建出的子会话在创建后立即
  `inbox.clear()`，丢弃从源会话种子继承的**待处理队列**（`agent/inbox/spliced` 里悬挂的
  next-turn / next-step 插入）。此前 fork 一个「最后一轮已完成、但仍有排队消息」的会话时，子会话会把
  源会话的排队消息重建成自己的待执行输入：用户在新会话里发消息，先跑的是那条旧消息，刚发的消息只能
  排在后面 pending（表现为「fork 后发送的是之前的消息，新消息一直 pending」）。清理以取消事件落盘，
  源会话的队列不受影响；子会话没有可清内容时不产生任何事件。补丁同时更新
  `tests/session-fork.host.spec.ts`（新增「子会话 inbox 为空」用例）与
  `tests/commands-create-fork.host.spec.ts`（假 Agent 补上 `inbox`）。
- `packages/api/session-controller/src/index.ts` 与 `.../src/types.ts`：`openWorkspacePath` 请求
  携带 `dshuiOrigin` 与 `dshuiLine`，并把它俩透传给 opener internals（0.1.7 起 opener 多了
  `openNativeAssociatedPath` / file-application 分支，dshui 的三处调用点已对齐）。`dshuiLine` 是链接
  的行号：上游的 markdown 渲染器把 `#L10` / `:10` 后缀剥离成自己的 `openFile` 选项，不会留在路径里，
  所以行号只能走请求字段；它经 native-command 变成桥接的 `line` 查询参数，由扩展 `showTextDocument`
  的选区定位。回归用例见 `tests/session-open-workspace-path.host.spec.ts` 的
  「threads the dshui requested line into the opener internals」。`verifyDesktopPath`
  校验前先经 `dshuiHomePath` 展开 `~`：浏览器不知道账号家目录，家目录链接只能以 `~` 拼写送到 Host，
  若直接 `resolve` 会被钉在服务器工作目录下（`<cwd>/~/.dsh/...`）。`verifyDesktopPath` 的校验同时接受
  软链别名：上游要求文件系统解析出的规范路径与浏览器给的拼写逐字相等，而文件系统按 realpath 标识目标，
  macOS 上 `/tmp` 是 `/private/tmp`、`$TMPDIR` 是 `/private/var/...`，于是任何指向临时目录的链接
  （agent 产出的截图、spill 文件等）都被判为「Path has no verified Host path」（422）。现在把请求拼写
  也过一次 Host realpath，与解析结果一致即通过；Host 无法规范化的路径照旧拒绝。回归用例见
  `tests/session-open-workspace-path.host.spec.ts` 的「opens a path spelled through a symlinked directory」。
- `packages/api/settings-controller/src/index.ts`：`openSettingsDocument(dshuiOrigin, signal)` 同样
  透传点击来源（0.1.7 起 SettingsController 只保留 `openTextFile`）。
- `packages/client/ui-chat/src/client/apply.ts` 与
  `packages/client/ui-settings-general/src/client/settings-document-store.ts`：客户端在调用上述两个
  remote 时附上窗口作用域（`__DSHUI_WORKSPACE__` 或 `dshui_workspace` 查询参数）；前者的
  `dshuiOpenPath` 决定文件链接目标的 Host 拼写（工作区相对 → 会话 cwd；家目录相对 → 去掉
  `./`/`../` 前缀后保留 `~`），并把上游的 `OpenFileOptions.line` 作为 `dshuiLine` 一起发出——上游
  的 `ChatView` 一直把行号交给 `openFile`，dshui 改造打开路径时漏掉了它，于是带行号的链接只打开文件
  顶部。用户消息里的链接由 dshui 自己的 `MessageItem.tsx` 投影渲染（见上文），那里同样解析
  `#L10` / `:10` 后缀并把行号交给 `openFile`。
- `packages/mcp/mcp-client/src/index.ts`：新增 `startup: 'eager' | 'lazy'` 配置（默认 `eager`）。
  `lazy` 时激活立即返回、由 supervisor 在后台连接并注册工具，慢速远端（如 OAuth 之后的服务器）
  不再拖住 dsh 启动；配套更新 README 与少量测试。

这些包由扩展的 `scripts/sync-dsh.mjs` 以**源码编译产物**填充 `node_modules/@deepseek-ai/*`，
而不再从 npm 下载。根 `package.json` 只声明**一个**锚点依赖 `@deepseek-ai/dsh`（其余 `@deepseek-ai/*`
是其清单里的传递依赖，`npm list` 因此认可整个闭包，却又不会去 registry 拉取——源码产物提前就位）。
运行时读取的是 `node_modules/@deepseek-ai/*` 中的**预编译产物**；本补丁用于从源码复现这些产物。

## 应用（必须锁定基提交）

补丁针对的基提交（**固定，不能漂移**）——dsh `0.2.1-rc.3` 的发布合并提交（tag `dsh-v0.2.1-rc.3`）：

```
1f81c047fc48fa190a683e469daa699857e9afe8
```

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
cd .dsh-src
git fetch origin 1f81c047fc48fa190a683e469daa699857e9afe8 && git checkout FETCH_HEAD
git apply --3way ../patches/dshui-bundles.patch     # 基提交不匹配会安全失败
pnpm install                                        # 需要 pnpm 11.7.0、Node ^22.19 || >=24
pnpm run clean                                      # 升级换基时必须清掉上一版的 lib/ 与 tsbuildinfo
pnpm run build:lib:host
pnpm run build:lib:client
pnpm run build:web                                  # 浏览器 shell（漏掉会让客户端插件全部加载失败）
pnpm run gen-client-catalog                         # 槽目录跟随 ui-chat 的槽声明重新生成
cd ..
node scripts/sync-dsh.mjs                           # @deepseek-ai/* 源码产物拷入 node_modules
node scripts/copy-clients.mjs                       # 两个 UI 包的 client.js 拷入 dshui-plugins/（校验 bundle id）
npm run compile
```

> 换基（上游版本跃迁）时用 `git apply --3way`：三方合并会把真正冲突的 hunk 标出来。
> 0.2.1-rc.2 → 0.2.1-rc.3 那次上游改了 640 个文件，与本补丁相交的只有 4 个
> （`ui-conversation/src/client/apply.ts`、`ui-conversation/src/client/skeleton/ConversationRoot.module.css`、
> `ui-workspace/src/client/navigation.ts`、`extensions/cordis-client-runner/src/client/slot-catalog.ts`），
> 全部干净套用、无需手工对齐；`slot-catalog.ts` 随后由 `pnpm run gen-client-catalog` 重新生成。

### 重新导出补丁

改动固化回补丁文件时**必须显式带 `--binary`**（`make dsh-gen-patch` 已内置）：

```sh
git -C .dsh-src diff --binary <基提交> > patches/dshui-bundles.patch
```

- **`--binary` 不可省**：基提交快照里含 PNG/ICO 等二进制资产，不加这个开关时 `git diff` 只写
  `Binary files /dev/null and b/... differ` 占位（**不含内容**），`git apply` 会报
  `cannot apply binary patch ... without full index line` 并**整体拒绝**该补丁。dshui 自身的改动
  目前全是文本，但只要基提交里含二进制新增就会踩中，所以一律带 `--binary`。
- **基提交必须跟着换**：`DSH_BASE`（Makefile）与本文档的 SHA 必须等于导出时用的那个提交。用旧基提交
  导出的补丁会把「旧基提交 → 新版」的全部上游差异一起装进去（rc.1 基提交导出时是 3447 文件 / 15.2 MB），
  补丁随即变得不可用；正常应稳定在 59 个文件 / 约 195 KB。
- **导出别用 `cd` 写法**：`make dsh-gen-patch` 用 `git -C $(DSH_SRC)` 加绝对输出路径。此前写成
  花括号组内 `cd $(DSH_SRC) && git diff … > "../patches/…"`，一旦 `cd` 失败，重定向会先把 patch
  截断成空文件再报错——补丁静默损毁。

> `pnpm run clean` 是换基升级的必要步骤：上一版留在各包 `lib/types` 与 `*.tsbuildinfo` 里的
> typert remote 声明是陈旧的，不清掉会让 `tsc -b` 直接复用旧产物，出现大量“remote 方法不存在”的
> 假错误。

## 上游漂移时

`git apply` 失败即说明基提交已漂移——按 [README「跟随 dsh 版本升级」](../README.md#跟随-dsh-版本升级)
一节的清单逐个重套（改动都很小，按文件内注释即可）。dsh 是 MIT 协议，本补丁与其产物可自由
修改/分发，保留上游版权声明即可。

## 0.2.1-rc.2 → 0.2.1-rc.3 重基记录

上游改了 640 个文件（+5682/-1021 行），主要内容是导航条目自定义与固定（#6247 / #6883）、
导航与预设选择的埋点（#6600），以及 DeepSeek API-key 路由跟随官方 `/models` 列表（#6944）。
与本补丁相交的只有 4 个文件，三方合并**零冲突**，其余 55 个文件干净套用：

| 文件 | 上游改动 | 处理 |
|---|---|---|
| `ui-conversation/src/client/apply.ts` | 会话头新增视图固定：`createViewPins`、`conversation.session.header.views.actions` 槽，注入 `entryPins` / `entryActions` / `setPinned` | 取上游实现；dshui 的 composer「无态降级」仍在 `conversation.composer.bar` 的 inject 内，未受影响 |
| `ui-conversation/src/client/skeleton/ConversationRoot.module.css` | 视图行改为可换行（25px 行高 + More 启动器），tabs 间距重排 | 取上游实现；dshui 的 scoped hero/composer 规则在文件末尾且按类名对齐，无需改动 |
| `ui-workspace/src/client/navigation.ts` | `connectBlank` 不再接受空预设，`startSession` 新增 `whenDraftExists`，空白会话按预设复用 | 保留 dshui 的 boot scope 选路（`scopedWorkspaceId`）与「作用域工作区行到货前不 settle」的等待 |
| `extensions/cordis-client-runner/src/client/slot-catalog.ts` | 生成物，条目随新槽重排 | 由 `pnpm run gen-client-catalog` 重新生成，结果与套补丁后的内容一致 |

宿主侧本轮无需改动：`path-opener.ts`、`browser-auth.ts`、`session-controller`、
`settings-controller`、`mcp-client` 的上游代码都没动。按「应用」一节的顺序重跑构建即可，
`build:lib:host` 与 `build:lib:client` 均无编译错误。

### 覆盖层下必然为红的上游用例（不是回归）

`pnpm run test:gui`（`vitest run packages/client packages/host`，653 个文件 / 10919 个用例）在套用本补丁后
固定有 3 个文件（3 个用例）失败，其余 649 个文件 / 10913 个用例通过（另 1 个跳过）。它们都是**覆盖层有意改变
上游行为**的必然结果，重基时不要当成回归去追：

| 用例 | 原因 |
|---|---|
| `packages/client/ui-tool/tests/toolview-slot.client.spec.tsx` | 上游 0.2.x 把文件打开改成产品内右侧预览（断言 `sidebarRight.openResource('dsh-resource://file/session/…')` 被调用且 `openWorkspacePath` **不**被调用），而 dshui 的 `ui-chat/apply.ts` 把 `openFile` 改成走 `remote.session.openWorkspacePath`，交给扩展宿主在 VS Code 编辑器里打开——这正是本扩展的存在意义 |
| `packages/client/ui-tool/tests/chat-ptc-subcalls.client.spec.tsx` | 同上，另一条 file-path 点击路径 |
| `packages/client/ui-theme/tests/radius-styles.client.spec.ts` | dshui 在 `ui-conversation/src/client/skeleton/HeroShell.module.css` 的 `.workspaceStatic` 用了 `border-radius: 16px`，不在 `ui-theme/tests/expected/radius-exceptions.expected.json` 的例外表里。想消掉这个红就把该值换成 `--dsw-radius-*` token，或把例外加进那份 expected JSON |

另外三个环境陷阱（本地跑门禁时踩过）：

- **`packages/util/native-command/tests/path-opener.spec.ts` 在 dshui 宿主的终端里会假红**：该 shell 继承了
  `DSHUI_OPEN_ENDPOINT` / `DSHUI_BRIDGES_FILE` / `DSHUI_CODE_CLI`，于是 `dshuiHosted(process.env)` 为真，
  darwin 分支转向桥接/CLI 路径，而用例把 `node:child_process` 的 `execFile` mock 成永不回调 → 5 个用例
  5s 超时。用 `env -u DSHUI_OPEN_ENDPOINT -u DSHUI_BRIDGES_FILE -u DSHUI_CODE_CLI` 复跑即 60/60 通过。
- 客户端的用例走源码平面（tsconfig paths），但 `client-bundle` 一类用例读的是 `lib/client.js` 产物，
  必须先在 `.dsh-src` 跑过 `pnpm run build:lib:client` 才有意义。
- **`packages/client/connection/tests/binary-rpc.host.spec.ts` 满负载并行时会假红**：两个
  「preserves … through the HTTP bridge」用例各要起一个真实 HTTP 服务，在 653 个文件并行时撞 5s
  超时；单独跑该文件 43/43 通过。

