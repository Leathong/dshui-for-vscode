# dsh 修改列表：VSCode 原生 Diff 审查方案

## 1. 背景与目标

当前 dsh 修改列表（`dsh-rollback-plugin` 的 ModificationDock）点击文件后会在侧边栏内联展开 Diff 和修改信息，不符合预期。

目标：

- 点击修改列表中的文件时，在 **VSCode 原生 Diff 编辑器**中展示修改。
- 在原生 Diff 中提供 **Accept / Undo** 能力，能调用 dsh rollback 的 RPC 真正接受或撤销修改。
- 修改列表只保留文件列表，不再内联展开 Diff，避免列表过长。
- 操作完成后侧边栏修改列表自动刷新，保持状态同步。

## 2. 方案总览

- 扩展通过 dsh server 的 Typert HTTP RPC 接口获取当前 session 的修改列表：

  ```
  POST /api/rollback/sessionChanges
  { type: 'client-request', rpcId, method: 'rollback/sessionChanges', payload: { args: { sessionId } } }
  ```

- 扩展为某个文件构造两个虚拟文档：

  - `dshui-rollback:/<reviewId>?side=orig`：原始/基线内容
  - `dshui-rollback:/<reviewId>?side=mod`：当前/修改后内容

- 使用 VSCode 内置命令打开原生 Diff：

  ```ts
  vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title, { preview: true })
  ```

- 原生 Diff 中的 Accept / Undo 提供两种稳定可用的交互方式：

  - **CodeLens 按钮**（推荐）：每个 hunk 的**首个变更行**上方渲染 `Accept` / `Undo` 可点击按钮（hunk 行号不可用时回退到修改侧第一行；删除文件锚定在原始侧），点击直接调用 RPC。依赖 `diffEditor.codeLens` 设置，扩展通过 `configurationDefaults` 将其默认值翻为 `true`。
  - **右键菜单命令**（保留）：`dshui.rollback.accept`、`dshui.rollback.undo`，根据当前 Diff 类型调用 `acceptFile`/`acceptModification` 或 `undoFile`/`undoModification`。

- 侧边栏 ModificationDock 只展示文件列表和操作按钮，不再内联展开 DiffBlock。

## 3. 数据流

```
ModificationDock (dsh SPA iframe)
  │  点击文件
  ▼
window.parent.postMessage({ type: 'dshui:reviewModifications', sessionId, listId, path })
  ▼
Webview shell (extension 内置 iframe 容器)
  │  转发给扩展宿主
  ▼
extension.ts onDidReceiveMessage
  │
  └─ RollbackReviewManager.showFile(...)
  ▼
RollbackReviewManager
  ├─ 调用 rollback/sessionChanges 获取最新 listId、changes、modifications
  ├─ 构造 original / modified 虚拟文档
  └─ 执行 vscode.diff 打开原生 Diff
  ▼
用户点击 Diff 修改侧顶部的 CodeLens 按钮（或右键菜单）Accept / Undo
  ▼
RollbackReviewManager 调用 rollback/acceptFile | undoFile
  ▼
成功 → 通知侧边栏刷新（dshui:modificationsChanged）并关闭当前 Diff
```

## 4. 关键实现

### 4.1 `src/rollbackReview.ts`

- `ROLLBACK_SCHEME = 'dshui-rollback'`
- `RollbackReviewManager`
  - 注册 `TextDocumentContentProvider`，按 URI 返回 `original` / `modified` 内容。
  - 注册 CodeLens provider：`registerCodeLensProvider({ scheme: ROLLBACK_SCHEME }, ...)`，只对 `dshui-rollback` 虚拟文档生效（不需要自定义语言）；按钮精确渲染在每个 hunk 的**首个变更行**上方（`firstChanged*Line`，由插件在解析/计算 diff 时给出，回退到 hunk 起始行）——删除的文件修改侧为空，按钮锚定在原始侧（`side=orig`）。按钮命令携带 state id 直接定位本次 Diff。
  - 修改级 Diff（`showModification`）的文档是 hunk 文本的拼接，按钮按各 hunk 在拼接文档内的累计行定位（`patchDocAnchors`），文件行号不适用。
  - 注册命令 `dshui.rollback.accept`、`dshui.rollback.undo`（CodeLens 传入 state id；右键菜单/命令面板无参时回退到按活动编辑器解析）。
  - `showFile(port, sessionId, path)`：打开文件级原生 Diff。
  - `showModification(port, sessionId, path, modificationId)`：保留单个 write/edit 修改的原生 Diff 能力。
  - `handleReviewCommand()`：从 state id 或活动编辑器解析 review state，分派到 accept/undo。
  - 虚拟文档语言：`showFile` 用 `openTextDocument` 探测真实文件的 language id，打开 Diff 后用 `setTextDocumentLanguage` 应用到两侧，让 Diff 带真实语法高亮（文件缺失/二进制时保持 plaintext）。
- RPC 封装：
  - `rollbackRpc<T>()`：POST `/api/rollback/<method>`，带 30s 超时。
  - `rollbackCall<T>()`：解包 Typert 外层的 `{ ok: true, value: RollbackResult<T> }`，统一成业务成功/失败。
- 文件级 diff 内容构造：
  - `created`：原文件为空，当前为文件内容或 hunk newText。
  - `deleted`：原始为 hunk oldText，当前为空。
  - `modified`：读取当前文件，反向应用 hunks 得到基线内容，左侧基线、右侧当前。
  - 无法完整重建时回退为 hunk oldText / newText 拼接。

### 4.2 `src/extension.ts`

- 在 Webview shell 中新增消息中继：
  - iframe → shell → extension：`dshui:reviewModifications`
  - extension → shell → iframe：`dshui:modificationsChanged`
- 在 `onDidReceiveMessage` 中处理 `dshui:reviewModifications`：
  - 读取 `sessionId`、`path`、可选 `modificationId`
  - 启动/复用 dsh server 后调用 `RollbackReviewManager.showFile` 或 `showModification`
- 在 `dispose` 中释放 `RollbackReviewManager`。

### 4.3 `package.json`

新增命令：

- `dshui.rollback.accept` — Accept This Change
- `dshui.rollback.undo` — Undo This Change

新增菜单项：

- `editor/context` 和 `editor/title/context`
- 条件：`resourceScheme == dshui-rollback`

新增 CodeLens 默认开关（Diff 编辑器渲染 CodeLens 依赖该设置，默认 `false`；`configurationDefaults` 只改默认值，用户可自行覆盖）：

```json
"configurationDefaults": {
  "diffEditor.codeLens": true
}
```

### 4.4 `plugins/dsh-rollback-plugin/src/client/ModificationDock.tsx`

- 修改列表只保留**文件列表**，不展示 write/edit 修改子行，避免列表过长。
- 文件行点击：
  - 不再 toggle 内联展开。
  - 发送 `dshui:reviewModifications` → 打开文件级原生 Diff。
- 文件行保留：
  - “在编辑器中打开文件”按钮。
  - 文件级 Accept / Undo 按钮。
- 监听 `dshui:modificationsChanged`，收到后刷新列表。
- 当存在修改记录但没有可映射的文件变更时，显示提示 `dock.modificationsOnly`。

### 4.5 插件 locales

新增文案：

- `openInEditor`
- `dock.modificationsOnly`

### 4.6 关于 CodeLens 与 `contribDiffEditorGutterToolBarMenus`

**CodeLens（当前实现采用的方案）**：

- VS Code 自 1.48（2020-07）起支持在原生 Diff 编辑器中渲染 CodeLens（[microsoft/vscode#97640](https://github.com/microsoft/vscode/issues/97640)）。
- 渲染由用户设置 `diffEditor.codeLens` 控制，默认 `false`；扩展通过 `contributes.configurationDefaults` 把默认值翻为 `true`。
- CodeLens provider 用 DocumentSelector 的 `scheme` 过滤（`{ scheme: 'dshui-rollback' }`），只对虚拟审查文档生效，**不需要注册自定义语言**；按钮按 hunk 锚点渲染（`firstChangedNewLine`→修改侧、`firstChangedOldLine`→原始侧），避免两侧重复。
- 副作用：`diffEditor.codeLens: true` 也会让其他 CodeLens provider（如引用计数）出现在 git 等普通 Diff 中；用户可在设置里关闭。

### 4.7 插件侧 hunk 数据契约（`dsh-rollback-plugin`）

为了让按钮"贴住变更"，hunk 新增两个可选字段：

- `firstChangedOldLine` / `firstChangedNewLine`：hunk 内**首个变更行**（跳过上下文前缀），1-based。
- `git.ts parseDiffHunks`：解析 body 时记录首个 `+`/`-` 行，`header 起始行 + 偏移` 即首个变更行。
- `ledger.ts lineDiffHunks(before, after)`：ledger 文件级修改不再是一个整文件 hunk，而是用行级 LCS diff 拆成带 3 行上下文的 git 风格多 hunk（公共前后缀裁剪 + 中间 LCS，超过 100 万格子回退整文件 hunk；两次变更间隔 > 6 行时拆成两个 hunk）。这样台账方式的文件 Diff 也能在每个变更处渲染按钮。
- 客户端"在编辑器中打开"的滚动定位（`ModificationDock` / `RollbackAction`）同样优先使用 `firstChangedNewLine`。

**`contribDiffEditorGutterToolBarMenus`（未采用，仍为 proposed API）**：

- 已核实：VS Code 源码 `menusExtensionPoint.ts` 中存在该贡献点，对应菜单 ID：

  - `diffEditor/gutter/hunk`
  - `diffEditor/gutter/selection`

- 它确实可以在原生 Diff 编辑器的 gutter 中渲染按钮，类似内置 Git 的 stage / revert 操作。
- **但它目前仍是 proposed API**（`proposed: 'contribDiffEditorGutterToolBarMenus'`）：
  - 需要在 `package.json` 中声明 `enabledApiProposals: ["contribDiffEditorGutterToolBarMenus"]`。
  - 只推荐在 VS Code **Insiders** 或本地开发中使用。
  - 普通 Stable VS Code 无法直接启用；需要带 `--enable-proposed-api=<EXTENSION_ID>` 启动。
  - 不能发布到 VS Code Marketplace；只能以 VSIX 分享给同样使用 Insiders / 开启 proposed API 的环境。
  - API 可能随版本变化，不保证兼容。

当前实现选择**稳定可用的 CodeLens 按钮 + 右键菜单 + 命令**，不依赖 proposed API，普通 Stable VS Code 可直接使用。若未来该贡献点转正，可在 gutter 中渲染更接近 Git 体验的按钮作为增强。

## 5. 关于“本次会话修改没有进入 change list”

`sessionChanges` 的 `changes` 只包含：

- 当前工作区相对 session baseline 有差异的文件（git 或 ledger）。
- 被 rollback ledger 捕获到的 `write` / `edit` 修改。

常见原因：

1. 插件更新后没有重启窗口 / 没有执行 `dshui.restartServer`，旧 server 仍加载旧插件。
2. 修改不是通过 dsh 的 `fs/write-intent` / `fs/edit-intent` 产生，ledger 没有捕获。
3. session 没有 baseline 快照，只能列出 ledger 覆盖的路径。

排查方式：

- 重启 VS Code 窗口。
- 新建会话，让 agent 执行 `write` / `edit`。
- 查看 dock 顶部 warning。
- 查看 `~/.dsh/dshui-logs/extension.log`。

## 6. 验证

- `npm run compile`：扩展 TypeScript 编译通过。
- `make typecheck` / `make test`：rollback 插件类型检查通过，44 个测试全部通过。
- RPC 冒烟测试：直接 POST `/api/rollback/sessionChanges` 能收到正确的 `server-response` 信封，说明扩展调用 rollback RPC 的路径可用。
- 手动验证路径：
  1. 启动扩展并进入一个 dsh session。
  2. 让 agent 修改一个文件。
  3. 在修改列表点击文件 → 应打开 VSCode 原生 Diff。
  4. 在原生 Diff 修改侧顶部点击 `Accept` / `Undo` CodeLens 按钮 → 应调用 rollback RPC 并刷新列表（若按钮不显示，检查设置里 `diffEditor.codeLens` 是否为 true）。
  5. 在原生 Diff 中右键 `Accept This Change` / `Undo This Change` → 应调用 rollback RPC 并刷新列表。
  6. 在侧边栏文件行点击 Accept / Undo → 应直接调用文件级 RPC 并刷新列表。
