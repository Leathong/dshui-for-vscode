# dsh UI for VS Code

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的 Web UI 嵌入 VS Code
侧边栏，与原版浏览器 UI 相比只有三处不同：

1. **无需选择工作区。** 你在 VS Code 里打开的文件夹就是 dsh 的工作区。扩展以该文件夹为工作目录
   启动 `dsh web` 服务器并把它注册为持久化 dsh Workspace，视图打开即有一个空白会话可用。
2. **侧边栏只列出当前工作区的会话。** 其他工作区、Ungrouped 桶、"添加工作区"、分组/排序视图选项
   全部隐藏——你看到的一切都属于当前打开的文件夹。
3. **输入框始终保持在最底部。** 去掉了居中的"新会话" hero，composer 在所有状态下都像活动会话一样
   固定在底部。

其余全部是原版 dsh Web UI：会话、工具卡片、goal、subagent、设置、模型选择、后台任务、反馈等。

## 工作原理

```
VS Code 侧边栏视图（webview）
  └── <iframe src="http://127.0.0.1:<port>">     ← 原版 dsh SPA（独立浏览器语义）
        └── 经 /api 与扩展拉起的 dsh 服务器通信
```

- 扩展把真实的 `@deepseek-ai/dsh` CLI 作为运行时依赖打包，以打开的文件夹为 cwd 启动
  `dsh --profile web`（端口见 `dshui.server.port`，0 = 系统分配；启动时预启动，避免黑屏）。
- 激活时把三个 dshui 插件装入 `$DSH_HOME/profiles/node_modules`（同时装入扩展自身
  `node_modules` 作为 loader 回退），并通过 `--patch` 覆盖层接入：
  - `dshui-host-ensure-workspace` — host 插件：启动时把工作目录注册为 Workspace，并向页面注入
    `window.__DSHUI_WORKSPACE__`（scope 路径）、`CSS_OVERRIDES` 免重建样式覆盖层（含字号收敛），
    以及 Cmd/Ctrl+C 复制处理器（VSCode webview 会拦截 iframe 内的复制快捷键，见
    microsoft/vscode#129178 / #180234）；
  - `dshui-client-ui-workspace` / `dshui-client-ui-conversation` — 两个原版客户端包的**重新构建产物**，
    内含侧边栏过滤与底部输入框改动。
- 文件打开：扩展内置一个本机 HTTP 桥（127.0.0.1 随机端口，随扩展生命周期启停），对内置
  api-proxy 应用幂等小补丁，把"打开文件"请求转交给桥，由扩展用 **VS Code API** 在当前窗口
  打开文件——**无系统确认弹窗**；`.html`/`.pdf` 仍走浏览器打开。可用 `dshui.openFilesInVscode`
  关闭（恢复系统默认程序）。

## 环境要求

- VS Code ≥ 1.85
- 无需单独安装 Node：扩展用扩展宿主内置的 Node（`ELECTRON_RUN_AS_NODE`）运行 dsh CLI。
- 只有「重新构建客户端 bundle」时才需要本机 Node ≥ 22.19 与 pnpm 11.7.0（见开发流程）。

## 安装

现成安装包在 `dshui-for-vscode-0.1.0.vsix`（内置 dsh 运行时，约 60 MB）：

```sh
code --install-extension dshui-for-vscode-0.1.0.vsix
```

从源码重新打包：

```sh
npm install
npm run compile                       # TypeScript -> out/
node scripts/copy-clients.mjs         # 仅当重新构建过客户端 bundle 时需要
npx @vscode/vsce package              # 产出 dshui-for-vscode-<version>.vsix
```

开发调试按 **F5**（仓库自带 `.vscode/launch.json`），或
`code --extensionDevelopmentPath="$PWD" <文件夹>`。

## 使用

1. 安装扩展（`dshui-for-vscode`）。
2. 打开一个文件夹——它就成为 dsh 工作区。
3. dsh UI 出现在侧边栏（活动栏图标 → **dsh**），打开文件夹时自动显示
   （可用 `dshui.autoOpen` 关闭，用 **dsh UI: Open** 命令重新打开）。
4. 在输入框直接使用。会话按文件夹持久化在你的 dsh home（`~/.dsh`，与浏览器 UI 共用）。

命令：

| 命令 | 说明 |
| --- | --- |
| `dshui.open` | 显示侧边栏 dsh UI 视图 |
| `dshui.openInBrowser` | 在系统浏览器打开同一个 scoped 服务器 |

设置：

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| `dshui.autoOpen` | `true` | 打开文件夹时自动显示侧边栏视图 |
| `dshui.server.port` | `0` | 内嵌服务器端口（0 = 系统分配）。固定端口可让浏览器端状态（localStorage）跨启动保持 |
| `dshui.openFilesInVscode` | `true` | 聊天里的文件链接在**当前 VS Code** 打开（经扩展内桥接，无系统弹窗），而非系统默认编辑器 |

## 开发流程

### 三级迭代，按需选择

dsh UI 本身是**上游代码**（deepseek-harness 仓库）：webview 渲染的是原版 SPA，侧边栏/输入框的改动
位于两个「客户端插件 bundle」里，由 dsh 服务器从已安装包中加载。扩展随包分发这些 bundle 的**预编译产物**
（`dshui-plugins/`）。迭代分三级：

| 改什么 | 改哪里 | 需要重建？ |
| --- | --- | --- |
| 扩展逻辑（服务器、webview、命令、设置） | `src/*.ts` | `npm run compile` 后 F5 |
| **视觉调整**（间距、颜色、贴底、隐藏元素） | `dshui-plugins/dshui-host-ensure-workspace/index.js` → `CSS_OVERRIDES` 列表 | **无需** — 重载窗口即可 |
| 客户端行为（过滤、hero 流程、组件逻辑） | `.dsh-src/packages/client/ui-workspace` / `ui-conversation`（TypeScript） | 完整客户端重建（见下） |

日常改扩展逻辑或样式**不需要**源码检出；只有结构性改 dsh 客户端代码才需要完整重建：

```sh
# 1. 从源码检出构建改过的客户端 bundle
cd .dsh-src
pnpm install                      # 需要 pnpm 11.7.0、Node ^22.19 || >=24
pnpm run build:lib:host           # 生成共享 /remote 模块
pnpm run build:lib:client         # 编译并打包全部客户端包
cd ..

# 2. 把新 bundle 拷进扩展插件包
node scripts/copy-clients.mjs

# 3. 编译扩展并启动 Extension Development Host
npm run compile
code --extensionDevelopmentPath="$PWD" <文件夹>
```

> `.dsh-src/`（约 1.6 GB）与 `.tools/` 只在需要重建客户端 bundle 时存在意义，可以随时删除——
> 运行时读的是 `dshui-plugins/` 里的预编译产物。删掉后失去的只是「再次修改客户端行为」的能力。

## 跟随 dsh 版本升级

扩展把两处 dsh 版本绑定在一起，升级时要一起对齐：

1. **CLI 运行时**：`package.json` 的 `dependencies["@deepseek-ai/dsh"]`（当前 `0.1.0-rc.6`）。
2. **客户端 bundle 的源码**：`.dsh-src` 检出（当前对应 rc.6 发布的相近提交；由于仓库 master
   可能落后于 npm 发布，对齐方式是看各包 `package.json` 的版本号，并以实际运行测试为准）。

升级步骤：

```sh
# 0. （可选）重新检出与目标版本对齐的源码
#    git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
#    （或 cd .dsh-src && git fetch && git checkout <与 npm 版本匹配的提交>）

# 1. 升级内置 CLI
npm install @deepseek-ai/dsh@<新版本>

# 2. 检查补丁是否还完整 —— 核心一步
node scripts/verify-patches.mjs      # 逐个标记缺失即说明该文件需要重新套用补丁

# 3. 缺失的补丁按下面清单重新套用（改动都很小，照着标记即可）
#    - ui-workspace/src/client/tree.ts                加 scopedWorkspacePath + 各 derive 的 scope 参数
#    - ui-workspace/src/client/WorkspaceBrowser.tsx    SCOPE 常量、workspaces/ungrouped 过滤、隐藏添加/视图选项、rail 隐藏 sectionHeader
#    - ui-workspace/tsdown.config.ts                   bundle id 改为 dshui-client-ui-workspace
#    - ui-conversation/.../ConversationRoot.tsx        SCOPE 常量、静态 chip、hero 隐藏、data-dshui-scope
#    - ui-conversation/.../EmptyHero.tsx               WorkspaceChip 的 staticChip prop
#    - ui-conversation/.../ConversationRoot.module.css  scoped hero flex-end
#    - ui-conversation/.../HeroShell.module.css        .workspaceStatic
#    - ui-conversation/tsdown.config.ts                bundle id 改为 dshui-client-ui-conversation

# 4. 重建并拷入
pnpm run build:lib:host && pnpm run build:lib:client   # 在 .dsh-src 内
node scripts/copy-clients.mjs

# 5. 重新编译扩展并打包
npm run compile && npx @vscode/vsce package
```

其它随版本漂移的风险点（升级后都要过一眼）：

- **`src/openPatch.ts`**（配合 `src/openBridge.ts`）：补丁定位的是 api-proxy 里原版 darwin 打开
  分支的字符串，并依赖服务器环境变量 `DSHUI_OPEN_ENDPOINT`（扩展启动桥时注入）。dsh 若改了这段
  代码，补丁会安全跳过并记日志（`file opener patch: ... skipping`）——此时按新代码重新写一下
  分支字符串即可；桥接不可用时会自动回退 `vscode://file`。
- **`patch.yml`**：覆盖的行 id（`ui-workspace` / `ui-conversation`）与插入的 `dshui-host-ensure-workspace`
  依赖 `web-app` bundle 里的行名和 `workspaceRegistry` / `webServer` 服务名；这些若变，需同步更新。
- **`dshui-plugins/*/package.json`**：`dsh.client.inject` 列表只是信息性依赖边，一般无需动。
- **数据兼容**：dsh 是预发布（rc），升级可能改持久化格式（`~/.dsh` 下的 sessions/storages）。
  升级前留意 release 说明；必要时备份 `~/.dsh`。

> 内嵌服务器与浏览器 UI 共用 `~/.dsh`。不要同时运行浏览器 UI 和扩展——dsh 磁盘状态不是多进程安全的。
