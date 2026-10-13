# dsh UI for VS Code

> 中文 · [English](README.en.md)

## 目录

- [简介](#简介)
- [特性](#特性)
- [环境要求](#环境要求)
- [安装](#安装)
- [快速开始](#快速开始)
  - [命令](#命令)
  - [设置](#设置)
  - [引用文件与代码片段](#引用文件与代码片段)
  - [文件打开](#文件打开)
  - [消息里的网络链接](#消息里的网络链接)
  - [多窗口（共享后端）](#多窗口共享后端)
  - [修改回滚](#修改回滚)
  - [IM 机器人](#im-机器人)
- [工作原理](#工作原理)
- [开发流程](#开发流程)
  - [三级迭代，按需选择](#三级迭代按需选择)
  - [跟随 dsh 版本升级](#跟随-dsh-版本升级)
- [注意事项](#注意事项)
- [贡献](#贡献)
- [反馈](#反馈)
- [许可证](#许可证)

## 简介

[dsh UI for VS Code](https://github.com/leathong/dshui-for-vscode) 是一个 VS Code 扩展，将
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`，DeepSeek 开源的
agentic coding 框架，主张「一切皆插件」）的 Web UI 嵌入 VS Code 侧边栏，让 agent 会话与代码工作流
同处一个窗口。

核心思路：**你在 VS Code 中打开的文件夹就是 dsh 的工作区**。扩展以该文件夹为工作目录启动内嵌的
`dsh web` 服务器（dsh CLI 随包内置，运行时自动使用本机 Node ≥ 22.19，见[环境要求](#环境要求)），
并将其注册为持久化 dsh Workspace。
会话聊天、工具卡片、goal、subagent、后台任务等 dsh 能力原样可用，同时获得与 VS Code 深度集成的体验。

<p align="center">
  <img src="media/screenshot.png" alt="dsh UI 嵌入 VS Code 侧边栏" width="90%">
  <br>
  <em>dsh UI 嵌入 VS Code 侧边栏：打开的文件夹即工作区，输入框常驻底部，侧边栏只列出当前工作区的会话。</em>
</p>

## 特性

与原版浏览器 UI 相比，本扩展主要有五处差异：

1. **无需选择工作区**。打开的文件夹即工作区：扩展以其为工作目录启动 `dsh web` 服务器并注册为
   持久化 Workspace，视图打开即有一个可用会话。
2. **侧边栏仅列出当前工作区的会话**。其他工作区、Ungrouped 桶、分组/排序等视图选项均被隐藏，
   所见即当前文件夹。
3. **输入框常驻底部**。移除居中的「新会话」hero，composer 在任意状态下都固定在底部。
4. **会话可直接删除**（菜单里同时保留 dsh 自带的「归档」）。删除操作由扩展宿主经 VS Code 文件 API
   直接移除 `~/.dsh/sessions/...` 下的会话日志（不经 dsh 的归档 RPC，dsh 自身行为不变）。
5. **用户消息中的 markdown 链接可点击**。`[label](url)` 形式的 http/https/mailto 链接在系统浏览器
   打开；相对路径（如 `[Makefile](Makefile)`）按会话 cwd 解析并在当前窗口打开对应文件，家目录路径
   （如 `~/.dsh/profiles/web/cordis.patch.yml`，含 `../~/.dsh/...` 这类写法）解析到账号家目录。

此外，dsh Web UI 的其余能力完整保留：会话聊天、工具卡片、goal、subagent、设置、模型选择、后台
任务、反馈等。扩展还提供若干 VS Code 深度集成：

- **主题跟随**：webview 内的 `prefers-color-scheme` 跟随 VS Code 主题而非操作系统，外观设置中的
  system 偏好解析为「跟随 VS Code 主题」；手动选择深色/浅色仍然优先。在系统浏览器中打开时仍跟随
  操作系统。
- **文件打开**：聊天中的文件链接在**当前 VS Code** 中打开，全程无系统确认弹窗（详见
  [文件打开](#文件打开)）。
- **引用文件与代码片段**：右键即可把文件引用或选中代码插入输入框（详见
  [引用文件与代码片段](#引用文件与代码片段)）。
- **多窗口共享后端**：所有窗口复用同一个内嵌服务器，无端口冲突，会话数据一致（详见
  [多窗口（共享后端）](#多窗口共享后端)）。
- **修改回滚**：agent 对工作区文件的每次修改都会进入侧边栏「修改列表」，可在 VS Code 原生 Diff
  中逐文件审查、接受或撤销（详见 [修改回滚](#修改回滚)）。
- **IM 机器人**：内置第三方插件 [`@xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im)
  （作者 xmanrui，MIT 许可证，v4.28.0），扫码或填入凭据即可把飞书、微信、钉钉、企业微信、QQ、
  Slack、Telegram、Discord、WhatsApp、iMessage、Email、Matrix 机器人接入 dsh，并提供公网
  AI Office 连接器（详见 [IM 机器人](#im-机器人)）。

## 环境要求

- VS Code ≥ 1.105（内置 dsh ≥ rc7 需要扩展宿主 Node ≥ 22.19；VS Code 1.105 起内嵌 Node 22.19，
  1.104 及更早不满足——`engines.vscode` 会在安装时就拦截，运行时也有守卫提示）
- dsh CLI 用**本机 Node ≥ 22.19** 启动（自动探测 `PATH` 与 Homebrew / nvm / fnm / asdf / Volta
  等常见安装位置，也可用 `dshui.server.nodePath` 指定）。dsh ≥ 0.1.6 启动时要经原生插件读取
  Node 内部模块，该插件无法在 VS Code 的 Electron 运行时里加载，所以本机没有可用 Node 时服务器
  起不来（扩展会退化为内置 Electron 运行时，并在日志与报错里提示；该退化只对 dsh ≤ 0.1.5 有效）。
- 仅当需要**从源码重建客户端 bundle** 时才需要本机 Node ≥ 22.19 与 pnpm 11.7.0（见
  [开发流程](#开发流程)）。

## 安装

**方式一：安装现成安装包**（推荐；内置 dsh 运行时，约 60 MB）

安装包随 [GitHub Releases](https://github.com/leathong/dshui-for-vscode/releases) 发布：

```sh
code --install-extension dshui-for-vscode-0.1.0.vsix
```

**方式二：从源码打包**

```sh
npm install                             # postinstall 会从 .dsh-src 同步 @deepseek-ai/*（见下）
npm run compile                         # TypeScript → out/
npx @vscode/vsce package                # 产出 dshui-for-vscode-<version>.vsix
```

> 从源码打包**需要**上游源码检出 `.dsh-src/`（不入库）：扩展的 `@deepseek-ai/*` 运行时不再从
> npm 下载，而是由 `scripts/sync-dsh.mjs` 从 `.dsh-src` 的构建产物填充（含 dshui 对 host 的改动，
> 见 `patches/README.md`）。全新克隆需先 clone 并构建 `.dsh-src`：
>
> ```sh
> git clone https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
> cd .dsh-src && git checkout <patches/README.md 中锁定的基提交> \
>   && git apply ../patches/dshui-bundles.patch \
>   && pnpm install && pnpm run build:lib:host && pnpm run build:lib:client
> cd .. && node scripts/sync-dsh.mjs
> ```
>
> 打包（vsce 的 `vscode:prepublish`＝compile + copy:clients + sync:dsh）与 `npm install` 的
> postinstall 都会自动跑 `sync-dsh`；`scripts/copy-clients.mjs` 在检出缺失时会自动跳过，使用随包
> 提交的预编译客户端 bundle。
>
> 升级 dsh 时还要保证根 `package.json` 声明了运行时闭包用到的全部**第三方**依赖：`@deepseek-ai/*`
> 的依赖表在 `sync-dsh` 落盘时被清空，只有根清单能安装它们。`sync-dsh`（preinstall）校验声明，
> `npm run verify:deps` 连已安装版本一起校验（打包前的 `vscode:prepublish` 必跑）；漏一个就会让相关
> 插件在启动时报 `failed to import`（0.1.7 升级时的 `execa` / `@modelcontextprotocol/client` /
> `@deepseek-ai/libreoffice-kit` 即此类）。

开发调试：按 **F5**（仓库自带 `.vscode/launch.json`），或运行
`code --extensionDevelopmentPath="$PWD" <文件夹>`。

## 快速开始

1. 安装扩展（`dshui-for-vscode`）。
2. 打开一个文件夹——该文件夹即成为 dsh 工作区。
3. 侧边栏出现 dsh UI（活动栏图标 → **dsh**）；打开文件夹时自动显示（可用 `dshui.autoOpen` 关闭，
   用 **dsh UI: Open** 命令重新打开）。
4. 在底部输入框直接使用。会话按文件夹持久化在 dsh home（`~/.dsh`，与浏览器 UI 共用）。

### 命令

| 命令 | 说明 |
| --- | --- |
| `dshui.open` | 显示侧边栏 dsh UI 视图 |
| `dshui.openInBrowser` | 在系统浏览器中打开同一个 scoped 服务器 |
| `dshui.referenceFile` | 将文件引用插入 dsh 输入框（资源管理器 / 编辑器 / 编辑器标签页右键菜单） |
| `dshui.referenceFolder` | 将文件夹引用插入 dsh 输入框（资源管理器右键菜单） |
| `dshui.referenceSelection` | 将选中代码片段（含行号）插入 dsh 输入框（编辑器右键菜单） |
| `dshui.restartServer` | 重启内嵌 dsh 服务器并刷新侧边栏视图（仅命令面板调用，无视图按钮以防误触；服务器未运行时等同启动） |
| `dshui.showLogs` | 在输出面板中显示 dsh UI 日志（View → Output → **dsh UI**），排查问题用 |
| `dshui.rollback.accept` | 接受当前回滚 Diff 中的修改（原生 Diff 的 CodeLens / 右键菜单 / 命令面板） |
| `dshui.rollback.undo` | 撤销当前回滚 Diff 中的修改（原生 Diff 的 CodeLens / 右键菜单 / 命令面板） |

> 重启服务器会中断正在进行的 agent 任务（会话数据持久化于 `~/.dsh`，不会丢失）。共享后端下若
> 服务器由**另一个窗口**启动，会先弹出确认框说明对其他窗口的影响；确认后本窗口接管：终止原监听
> 进程并在同一端口重新拉起成为新 owner，其他窗口 URL 不变，重载后自动恢复。修改 `dshui.server.port`
> 等设置后可用该命令立即生效，无需重载窗口。

### 日志与排查

扩展的报错、插件安装结果、内嵌 dsh 服务器自身的 stdout/stderr（含 host 补丁桥接/CLI 回退的告警）都会写入
VS Code 的**输出面板**（View → Output → 下拉选择 **dsh UI**，或命令面板运行 **dsh UI: Show Logs**）：
服务器启动/退出、共享后端注册、打开桥、版本检查等生命周期事件也记录在内。服务器启动失败时，
错误通知会附带 **View Logs / 查看日志** 按钮，一键打开输出面板。

同一份日志（时间戳 + 级别前缀）还会追加写入 `~/.dsh/dshui-logs/extension.log`（dsh home 下），
便于命令行/无头环境排查；扩展宿主内部的未捕获异常与未处理的 Promise rejection 也会记录到输出面板。

启动日志里的 `launching dsh web with system Node.js v… (…)` 记录了本次实际使用的 Node；若本机没有
可用 Node，会先出现 `no system Node.js >= 22.19.0 found …` 告警，随后 dsh 报
`host preparation failed: node-addon-require-builtin unsupported: Unsupported/no-realm`（原生插件
版本较新时可能显示 `Unsupported/no-context` 与 `unsupported Electron runtime fingerprint`）——此时
安装 Node.js ≥ 22.19（或把 `dshui.server.nodePath` 指向一个 Node 二进制），再运行
**dsh UI: Restart dsh Server** 即可，无需重载窗口。

### 设置

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| `dshui.autoOpen` | `true` | 打开文件夹时自动显示侧边栏视图 |
| `dshui.server.port` | `61370` | 内嵌服务器端口。固定端口兼作共享后端会合点：所有窗口复用同一个服务器（各按 `?dshui_workspace` 作用域），localStorage 按工作区隔离，各工作区跨启动恢复自己上次打开的会话；设为 `0` 则由系统分配（无共享、无保持）。固定端口被占用时直接报错并提示更换端口 |
| `dshui.server.nodePath` | 空 | 用来启动 dsh CLI 的 Node ≥ 22.19 可执行文件。留空 = 自动探测（`PATH`，再到 Homebrew / nvm / fnm / asdf / Volta / Program Files 等常见位置）；填 `electron` = 强制使用 VS Code 内置 Electron 运行时（仅 dsh ≤ 0.1.5 可用）。改完需运行 **dsh UI: Restart dsh Server** |
| `dshui.openFilesInVscode` | `true` | 聊天中的文件链接在**当前 VS Code** 中打开（经扩展内桥接，无系统弹窗），而非系统默认编辑器 |
| `dshui.checkDshUpdates` | `true` | 启动时异步查询 npm 上的最新 dsh 版本，内置版本过旧时通知（24 小时节流，同一新版本仅提示一次；可关闭） |
| `dshui.windowOrigin` | `true` | 每个窗口经**自己的 loopback origin**（扩展内代理）加载共享服务器：浏览器的每 origin 连接池与 localStorage/IndexedDB 归本窗口独有，窗口之间既不会互相挤占连接、也不会串工作区状态；工作区作用域由代理写入页面，不再依赖可被跳转丢弃的 URL 查询。关闭则所有窗口直接共用 `127.0.0.1:<port>` 这一个 origin |

### 引用文件与代码片段

在**资源管理器**中右键文件或**文件夹**、或在**编辑器标签页**上右键 → **Add File to dsh** /
**Add Folder to dsh**；在**编辑器**中选中代码后右键 → **Add Selection to dsh**。引用以消息文本
插入侧边栏输入框（自动聚焦侧边栏视图）：

- 文件 / 文件夹引用：`[src/extension.ts](src/extension.ts)` / `[src/components/](src/components/)`——
  标准 markdown 链接（相对路径），智能体以自带工具读取 / 列出，不占用输入框体积；
- 代码片段引用：`[src/extension.ts#L10-L20](src/extension.ts#L10-L20)` + 代码块——路径、行号
  （GitHub 风格 `#Lx-Ly` 锚点）与选中代码一并提供给智能体；超长选中（> 20,000 字符）会截断并附注
  完整路径。

引用在面板未就绪（启动中）时不会丢失：webview 外壳先缓冲，dsh SPA 就绪后自动写入草稿；输入框
忙碌（正在提交）时会等待其可写后再插入。

### 文件打开

聊天中的文件链接默认在**当前 VS Code** 中打开，且**无系统确认弹窗**：

- 扩展内置一个本机 HTTP 桥（127.0.0.1 随机端口，随扩展生命周期启停），对 api-proxy 应用幂等小
  补丁，把「打开文件」请求转交该桥，由扩展经 **VS Code API** 打开文件；
- 链接目标按两种拼写解析：工作区相对路径（含 `./`/`../`）按**会话 cwd** 拼接；家目录路径
  （`~`、`~/…`，含 `../~/.dsh/...` 这类被 `./`/`../` 前缀包裹的写法——前缀越不过家目录锚点，
  会被丢弃）由服务器展开到账号家目录。浏览器读不到家目录，所以这类目标保留 `~` 拼写送到宿主，
  不会被拼成 `<cwd>/~/.dsh/...`；
- **绝对路径**（如 agent 写在临时目录里的截图 `/tmp/…`、`$TMPDIR/…`）同样能打开：Host 以 realpath 校验，
  软链拼写（macOS 上 `/tmp` → `/private/tmp`、`$TMPDIR` → `/private/var/...`）不再被判为
  「Path has no verified Host path」；
- 共享后端下每个窗口将自己的工作区与桥登记到 `$DSH_HOME/dshui-bridges.json`。补丁优先在**点击所在
  窗口**打开：客户端把会话的工作区目录随打开请求一起带上（`dshuiOrigin`），目标路径在其中时即路由
  到点击窗口的桥；否则按「打开路径所属工作区（最长前缀）」路由到**点击文件的窗口**的桥。嵌套工作区
  （外层与子目录分别开窗）因此也能在点击的窗口打开，而不是总被最长前缀拉到子窗口。工作区外路径、
  同目录多窗口等边界场景退回 owner 的桥；
- 桥不可用时依次回退：`code` CLI（应用内路径经 `DSHUI_CODE_CLI` 传给服务器，走 CLI socket 协议
  打开正在运行的 VS Code，同样无确认弹窗）→ `open vscode://file/...`（带确认弹窗）；
- **文本/非文本自动识别**：桥先看扩展名（图片、PDF、压缩包、音视频、可执行文件、字体等），其余读文件头
  512 字节套用 VS Code 自己的判别规则（出现 NUL 字节即视为二进制；UTF-16 BOM 与「每隔一字节为零」的无
  BOM UTF-16 例外，故 GBK 等遗留编码仍按文本打开）。非文本改走 `vscode.open`：**图片用内置图片预览**
  打开，其余二进制交给 VS Code 的二进制查看器——此前这些文件被 `showTextDocument` 直接拒绝，只在日志里
  留下 “File seems to be binary and cannot be opened as text”；连 `vscode.open` 也失败时退回系统默认
  程序；
- **行号定位**：链接目标里的 `#L10`（GitHub 风格锚点；`#L10-L20` 这类区间取首行）与 `:10`（含
  `:10-20`、en dash 区间）后缀在打开前被剥离并解析成 1-based 行号，随打开请求以 `dshuiLine` 传给
  宿主桥，由 `showTextDocument` 的选区把该行滚入视野并选中。行号定位只对文本文件生效，非文本走
  预览 / 二进制查看器；
- `.html` / `.pdf` 仍走系统浏览器打开；可用 `dshui.openFilesInVscode` 关闭（恢复系统默认程序）。

### 消息里的网络链接

聊天消息里的 **http/https 链接**（含 `mailto:`）默认在**系统浏览器**中打开。dsh 把这类链接渲染成
`<a target="_blank">`，在普通浏览器里会开新标签页，但 VS Code webview 会拦截 `window.open`/弹窗，
点击原本无反应——host 插件注入的捕获阶段点击拦截器把这类链接改为：点击 → 经 webview 外壳转发给
扩展宿主 → `vscode.env.openExternal` 打开系统浏览器。修饰键点击（Cmd/Ctrl/Shift/Alt+点击）放行给
VS Code 自身处理；非 http(s) 目的地（如 `javascript:`）不做拦截。

### 多窗口（共享后端）

固定端口（默认 61370）兼作会合点：第二个窗口激活时探测该端口，发现已有 dshui 服务器则直接复用
（不再拉起新进程），并将自己的文件夹经 `$DSH_HOME/dshui-workspaces/` 的 marker 注册进共享服务器，
webview 以 `?dshui_workspace=<folder>` 连接，host 插件按连接解析作用域。生命周期：
`$DSH_HOME/dshui-server.json` 记录使用窗口的 pid，服务器 detached 启动（可存活于启动它的窗口之外），
host 插件轮询注册表，无存活窗口时自行退出。采纳方即使遇到注册表尚未落盘（owner 窗口仍在启动登记中）
也会补建注册表并登记自己；owner 关闭时据注册表判断是否还有别的窗口在用——启动竞态下不再误停共享
服务器、断掉其他窗口。由此，同一或不同工作区的窗口共享一个后端，`~/.dsh`
始终只有一个进程写入，不再有 EADDRINUSE 冲突，也规避了 dsh 上游 README 关于多进程共享磁盘状态的
警告。

注意事项：

- **文件打开**：各窗口登记自己的桥（`dshui-bridges.json`，按 pid 探活清理），补丁按「点击 origin
  优先 → 最长工作区前缀 → owner 桥」路由。客户端随打开请求携带点击所在会话的工作区目录
  （`dshuiOrigin`），目标路径在其中时就在**点击的窗口**打开——嵌套工作区（外层与子目录分别开窗）
  下，外层窗口点击子工作区的文件也会在当前窗口打开，而不是被最长前缀拉到子窗口；否则文件在哪个
  窗口的工作区下就在哪个窗口打开。边界场景退回 owner 的桥：文件不在任何已登记工作区下（如
  `/tmp/...`）、或两个窗口打开同一文件夹（无法区分，取最近登记的）。owner 关闭后桥不可用，回退
  `code` CLI（在**最近聚焦**的 VS Code 窗口打开，无确认弹窗），再退回 `vscode://file`（带确认弹窗）。
- **localStorage 按工作区隔离**：页面注入的补丁把所有 localStorage 键按工作区前缀命名空间隔离
  （host 插件按 `?dshui_workspace` 解析作用域），因此每个工作区各自记住自己上次打开的会话与视图
  状态，互不串扰；同一工作区的多个窗口之间仍共享（如窗口内重载后恢复）。直接访问服务器根地址
  （无工作区查询参数）时保持原版无隔离行为。
- **launch token 按实况校验**：窗口缓存的共享服务器 launch token 可能属于已被替换的进程，而 webview
  的 cookie 仍然有效——带旧 token 的索引请求会走到「已认证 + token 不匹配」的跳转，把
  `?dshui_workspace`（以及 `dshui_theme`）一并丢掉，面板随之落到服务器自己的工作目录，新建会话就
  创建在错误工作区。扩展因此在每次导航前用 `GET /?token=…` 逐个探测候选（子进程自带 → 注册表 →
  上次缓存），只发送在跑服务器接受的 token，都不接受就不带 token 加载索引（cookie 认证不跳转，
  作用域照常保留）。续租心跳也会在条目被其他窗口按 TTL 清掉后重新登记自己（注册表与桥表），避免
  仍有窗口在用时共享服务器被误回收——回收换进程正是 token 失效的源头。
- **每窗口独立 origin**：每个窗口经扩展内的 loopback 代理（`dshui.windowOrigin`，默认开）加载共享服务器，
  浏览器的**每 origin HTTP 连接池**与 localStorage/IndexedDB 因此归本窗口独有。共用一个 origin 时，
  整个 VS Code 实例只有 6 个 HTTP/1.1 连接槽：任一窗口占满或泄漏连接后，其它窗口的 `/api` 调用
  （发消息就是一次 POST）会永远排在浏览器队列里——界面照常能输入，host 却收不到也没有报错。
  代理还把工作区作用域**写进返回的页面**（覆盖 host 插件注入的 `window.__DSHUI_WORKSPACE__`），
  作用域不再依赖可能被跳转丢弃的 URL 查询。仍然只有**一个 dsh 进程**：单写者、单份 IM 连接、无端口冲突。
- **共享服务器存活看门狗**：采纳别人服务器的窗口无法感知那个进程已退出或被替换（句柄仍显示 running），
  面板就会停在死连接上：能输入、能点发送，消息写进已关闭的流里静默消失。扩展每 15 秒探测一次会合端口，
  端口消失即丢弃失效句柄并重新会合，服务器换代（launch token 变化）则重新导航面板，让窗口自行重建连接。
- 共享仅在固定端口（默认）下生效；`dshui.server.port = 0` 时每个窗口各起一个随机端口服务器。

### 修改回滚

扩展内置 `dsh-rollback-plugin`，把 agent 在会话中对工作区文件的每一次 `write` / `edit` 修改
记录为「未接受修改」（相对会话基线快照），让你在 **VS Code 原生 Diff** 中审查并选择**接受**或
**撤销**——这是原版 dsh 没有的能力：

- **修改列表**：agent 产生修改后，会话视图中出现可折叠的「修改列表」面板，只列出修改过且尚未
  接受的文件（含未接受数量、基线轮次）；文件行提供「在编辑器中打开」「接受此修改」「撤销此修改」
  （撤销需确认），面板头部还有「全部接受」/「全部撤销」与「显示已接受」。
- **原生 Diff 审查**：点击文件行 → 在 **VS Code 原生 Diff 编辑器**中打开（左侧只读基线，
  **右侧直接就是工作区当前文件**，可以在 Diff 里直接编辑保存；因原始侧是自定义 scheme，
  扩展会用 `setActiveEditorWriteableInSession` 把右侧标记为会话内可写；仅删除文件或二进制/
  截断等降级场景右侧才是只读虚拟文档；两侧均带真实语法高亮）；每个变更 hunk 上方渲染
  **Accept / Undo** CodeLens 按钮（右侧为真实文件时，按钮只在该审查 Diff 打开期间显示，
  不会残留到普通编辑器），也可在 Diff 中右键 **Accept This Change** / **Undo This Change**，
  或从命令面板调用 `dshui.rollback.accept` / `dshui.rollback.undo`。
- **直接编辑联动**：在 Diff 右侧编辑并保存后，修改列表自动刷新，左侧基线与按钮锚点跟随新内容，
  Accept / Undo 依然可用；**接受**会先把未保存的编辑落盘、按你看到的当前内容接受；**撤销**的
  确认框会提示未保存编辑将一并丢弃，恢复基线后编辑器自动重载，不会弹出保存冲突。
- **真正落盘**：接受/撤销直接调用 dsh rollback 的 RPC——接受即把修改写入工作区并从未接受列表
  移除；撤销即把文件恢复到会话基线。操作成功后修改列表自动刷新，已过期的当前 Diff 会自动关闭。
- **撤销粒度是「文件」**：撤销一个文件会把该文件整体恢复到会话基线（第 N 轮快照），基线之后的
  修改会一并丢失；面板与确认框对此都有明确提示。

<p align="center">
  <img src="media/Screenshot_rollback.png" alt="修改回滚：在 VS Code 原生 Diff 中审查并接受/撤销 agent 的修改" width="90%">
  <br>
  <em>修改回滚：侧边栏「修改列表」点击文件后，在 VS Code 原生 Diff 中逐 hunk 接受或撤销修改。</em>
</p>

### IM 机器人

扩展内置第三方插件 [`@xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im)（**来源：
[github.com/xmanrui/dsh-im](https://github.com/xmanrui/dsh-im)，作者 xmanrui，MIT 许可证**，
v4.28.0 随扩展分发，许可证与第三方声明见插件目录下的 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`），
把 IM 机器人接入 dsh：

- **一个设置入口**：打开 dsh UI 的「设置 → 插件 → IM机器人」，通过扫码、App Manifest 或已有机器人
  凭据接入并统一管理飞书、微信、钉钉、企业微信（智能机器人 / 自建应用）、QQ、Slack、Telegram、
  Discord、WhatsApp、iMessage、Email（IMAP/SMTP 与 Agent 邮箱）与 Matrix（实验）共 12 个渠道，
  另含公网 AI Office 连接器；**每个渠道都能接多个机器人**。凭据/Token 只提交到本机 Harness Host，
  写入受保护的凭据存储，不回传给状态接口。
- **IM 即会话入口**：机器人在 IM 中收到的消息交给 Harness 处理并流式回复；每个机器人维护独立的
  Harness 工作区、模型与会话绑定，支持 `/workspace`、`/workspacelist`、`/sessionlist`、`/session`
  等命令切换工作区与绑定会话。
- **离开模式（飞书）**：在 dsh UI 会话输入框发送 `/away on` 开启（`/away off` 关闭、`/away` 查询、
  `/away prune` 清理空闲工作区的群）后，插件为**有运行中会话**的工作区创建 `DSH-{workspace}` 飞书群
  并接管这些会话。提问与审批以交互卡片推送，并与 Web 端**竞速**——谁先作答算谁的；IM 内部只由所属群
  弹卡，不会在多个聊天里重复推送。群在飞书被解散后会自动重建，并在下一个同步周期重新接管。
- **随包分发的运行依赖**：它的宿主 bundle 把 `qrcode`、`dingtalk-stream`、`@tencent-connect/*`、
  `@wecom/aibot-node-sdk`、`imapflow`、`mailparser`、`nodemailer`、`undici`、`@matrix-org/olm`
  留作运行时依赖，stage 时由 `make stage-deps` 裁进插件目录的 `node_modules/`（约 12.8 MiB），
  扩展激活时随 `lib/` 一并安装，**无需联网 `npm install`**。可选能力 `sharp`（入站图片压缩）与
  `@tencent-qqmail/agently-cli`（Email 的 Agent 邮箱）未随包分发：超过模型上限的图片会改为存入
  工作区并提示模型用工具读取，Agent 邮箱提示缺少 CLI，同渠道的 IMAP/SMTP 邮箱不受影响。
- **更新方式**：插件自带的「更新」面板面向 `dsh plugin add` 安装到 profile 的副本（会去 npm 查
  新版本）；扩展分发的副本不在它的管理路径内，面板会显示为不可更新——随扩展版本升级即可，扩展
  激活时按版本覆盖安装。
- **安全提示**：机器人的可见范围就是入站访问范围——请只把机器人开放给可信的租户、组织、群或
  成员。各渠道的扫码/凭据接入流程与更多安全说明见
  [上游 README](https://github.com/xmanrui/dsh-im#readme)。

## 工作原理

```
VS Code 侧边栏视图（webview）
  └── <iframe src="http://127.0.0.1:<port>">     ← 原版 dsh SPA（独立浏览器语义）
        └── 经 /api 与扩展拉起的 dsh 服务器通信
```

- **服务器**：扩展将真实的 `@deepseek-ai/dsh` CLI 作为运行时依赖打包，以打开的文件夹为 cwd 启动
  `dsh --profile web`（端口见 `dshui.server.port`，默认固定 61370；启动时预启动，避免视图加载时的
  空白）。
- **启动恢复上次会话**：固定端口复用同一 origin，客户端将当前会话写入 localStorage
  （`dsh.sessions.current`），下次启动原生恢复——打开的就是上次最后使用的会话；无历史会话时退回
  空白新会话。存储与初始定位都按工作区隔离（`dshui_workspace` scope）：新打开一个从无历史会话的
  文件夹，默认落在**该文件夹自己的工作区**的新会话，而不会串到上一个窗口的工作区。固定端口被占用
  时直接报错并提示修改 `dshui.server.port`，不再退回随机端口。
- **插件装载**：激活时把随扩展分发的插件装入 `$DSH_HOME/profiles/node_modules`（同时装入
  扩展自身 `node_modules` 作为 loader 回退），并经 `--patch` 覆盖层接入（见 `patch.yml`）：
  - `dshui-host-ensure-workspace`——host 插件：启动时把工作目录注册为 Workspace，并向页面注入
    `window.__DSHUI_WORKSPACE__`（scope 路径）、`CSS_OVERRIDES` 免重建样式覆盖层（含字号收敛）、
    VS Code 主题接管补丁（影子 `matchMedia`，详见本节「主题跟随」）、Cmd/Ctrl+C/V/X/A/Z
    剪贴板与撤销/重做处理器（VS Code webview 会拦截 iframe 内的这些快捷键，见
    [microsoft/vscode#129178](https://github.com/microsoft/vscode/issues/129178) 与
    [microsoft/vscode#180234](https://github.com/microsoft/vscode/issues/180234)；
    重做 = Shift+Cmd/Ctrl+Z 或 Cmd/Ctrl+Y）、Cmd/Ctrl+N 新建
    会话处理器（拦截 workbench 的「新窗口」快捷键，改走侧边栏「新建会话」按钮），以及文件/代码
    引用写入处理器（接收扩展右键菜单经 webview 外壳转发的引用消息，写入 composer 草稿）；
  - `dshui-client-ui-workspace` / `dshui-client-ui-conversation`——两个原版客户端包的**重新构建产物**
    （补丁把这两个包的 tsdown bundle id 改成 dshui 名；`patch.yml` 停用原生 `ui-workspace` /
    `ui-conversation` 行，再插入同名新行，产物经 `scripts/copy-clients.mjs` 拷入 `dshui-plugins/`）。
    内含侧边栏过滤、底部输入框改动与「删除会话」菜单（删除经 webview 外壳 → 扩展宿主以 VS Code 文件
    API 完成）。关键约束：**行 id 必须等于 bundle 内 `window.__ModuleLoader__.load({ id })` 声明的 id**
    （0.1.7 的客户端加载器按后者建工厂表，不匹配则整行加载失败）；而该行一失败，它提供的
    `uiWorkspace` / `uiConversation` 服务就缺席，20 多个注入这两个服务的客户端插件会永远停在 PENDING
    ——浏览器表现为 **Failed to load plugins**。因此拷贝前必须先 `pnpm run build:lib:client`
    （陈旧产物仍声明上游 `@deepseek-ai/...` id），`copy-clients.mjs` 会校验并在不匹配时报错。
  - `dshui-host-workspace-changes-stub`——host 插件：官方每轮改动采集器
    （`@deepseek-ai/dsh-workspace-changes`，渲染 GUI 的「编辑了 N 个文件」卡片与右侧变更审查）由
    `patch.yml` 停用，本插件只补上它留下的空 `workspaceChanges` 服务。这个配对是强制的：该服务
    缺席会让 stock `ui-deliverables` 的 Host 半边永远 PENDING，连带 present
    交付卡片、原生打开、正文文件提及与 present 系统提示词段一起失效；
    `scripts/verify-overlay.mjs` 在打包时校验这一配对（停用必须有替换、替换行必须真实存在）。
    修改列表因此只剩 `dsh-rollback-plugin` 的 dock 一种来源。
  - `dsh-rollback-plugin`——修改回滚插件：记录 agent 的 `write` / `edit` 修改与会话基线快照，
    提供「修改列表」dock 与原生 Diff 审查（详见 [修改回滚](#修改回滚)）。
  - `@xmanrui/dsh-im`——第三方 IM 机器人插件（**来源：
    [github.com/xmanrui/dsh-im](https://github.com/xmanrui/dsh-im)，作者 xmanrui，MIT 许可证**）：
    把飞书、微信、钉钉、企业微信、QQ、Slack、Telegram、Discord、WhatsApp、iMessage、Email、
    Matrix 十二个渠道的 IM 机器人与公网 AI Office 接入 dsh（详见 [IM 机器人](#im-机器人)）。其宿主
    bundle 把 `qrcode`、`dingtalk-stream`、qqbot / wecom SDK、`imapflow`、`mailparser`、
    `nodemailer`、`undici`、`@matrix-org/olm` 声明为外部运行时依赖，因此插件目录自带一份裁剪过的
    生产依赖 `node_modules/`（约 12.8 MiB），由 `installPlugins()` 随 `lib/` 一并安装。
- **删除会话**：dsh 自带「归档」（隐藏会话、不删文件），但没有删除 RPC。插件在会话行菜单与悬停
  操作里**新增**「删除会话」（0.1.7 起上游把会话行操作改成 slot 条目，删除与归档/置顶并存）：点击后
  插件向 webview 外壳 postMessage（`dshui:deleteSession`，
  携带会话 id 与其工作区目录），外壳转发给扩展宿主；宿主按 dsh 的会话路径规则
  （`$DSH_HOME/sessions/<工作区目录编码>/<会话 id>/`，与 `dsh-session-persistence-jsonl` 的
  `projectKey`/`encodeSegment` 一致）定位会话目录，用 **VS Code 文件 API**
  （`vscode.workspace.fs.delete`，递归）删除其日志文件，再经外壳回传结果
  （`dshui:sessionDeleted`）；插件收到确认后隐藏该行（下次 `session.list` 重拉时该会话已不存在），
  若删除的是当前会话则回到「新会话」视图。非 VS Code 环境（如在系统浏览器中打开）或宿主无响应
  （15 秒超时）时删除失败并保留该行。
- **主题跟随**：webview iframe 内的 `prefers-color-scheme` 本跟随操作系统，与 VS Code 主题
  （`workbench.colorTheme`）可能不一致。扩展在每次视图加载与主题切换时把当前配色方案
  （Dark/HighContrast → 深色，其余 → 浅色）经外壳与 URL 参数 `dshui_theme` 传给 SPA，host 插件
  注入的补丁以影子 `matchMedia` 接管该查询——外观设置中的 **system** 偏好因此解析为「跟随 VS Code
  主题」而非操作系统；手动选择深色/浅色仍然优先。在系统浏览器中打开（`dshui.openInBrowser`）不带
  该参数，仍跟随操作系统。

## 开发流程

### 三级迭代，按需选择

webview 渲染的是**原版 dsh SPA**（deepseek-harness 仓库的上游代码）；侧边栏/输入框的改动不在
上游，而是集中在两个「客户端插件 bundle」中——它们由上游客户端包重新构建并注入 dshui 改动，
随扩展分发**预编译产物**（`dshui-plugins/`），由 dsh 服务器从已安装包加载。

对上游源码的改动以补丁形式随仓库发布：`patches/dshui-bundles.patch`（48 个文件，覆盖
`ui-workspace` / `ui-conversation` / `ui-chat` 及其测试、host 的文件打开、浏览器重定向与
会话 fork 的继承队列清理；基提交固定，应用步骤见 `patches/README.md`）。上游源码（`.dsh-src`）
与构建工具（`.tools/`）**不提交到 git**。

| 改什么 | 改哪里 | 需要重建？ |
| --- | --- | --- |
| 扩展逻辑（服务器、webview、命令、设置） | `src/*.ts` | `npm run compile` 后 F5 |
| **视觉调整**（间距、颜色、贴底、隐藏元素） | `dshui-plugins/dshui-host-ensure-workspace/index.js` → `CSS_OVERRIDES` 列表 | **无需**——重载窗口即可 |
| 客户端行为（过滤、hero 流程、组件逻辑） | `.dsh-src/packages/client/ui-workspace` / `ui-conversation`（TypeScript，需先按 `patches/README.md` 获取源码） | 完整客户端重建（见下） |

修改 `dshui-host-ensure-workspace/index.js` 中注入页面的浏览器脚本（剪贴板/撤销重做、引用写入、
主题接管）后，可先运行自带的行为冒烟测试再重载窗口：

```sh
node scripts/check-clipboard-patch.mjs && node scripts/test-clipboard-patch.mjs
node scripts/check-reference-patch.mjs && node scripts/test-reference-patch.mjs
node scripts/check-theme-patch.mjs && node scripts/test-theme-patch.mjs
```

日常修改扩展逻辑或样式**不需要**源码检出；仅结构性修改 dsh 客户端代码才需要完整重建：

```sh
# 0. 获取上游源码并应用 dshui 补丁（源码不入库；基提交与完整命令见 patches/README.md）
git clone https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
cd .dsh-src
git fetch origin <patches/README.md 中的基提交> && git checkout FETCH_HEAD
git apply ../patches/dshui-bundles.patch   # 基提交不匹配会安全失败
cd ..

# 1. 从源码构建改过的客户端 bundle
cd .dsh-src
pnpm clean
pnpm install                      # 需要 pnpm 11.7.0、Node ^22.19 || >=24
pnpm run build:lib:host           # 生成共享 /remote 模块
pnpm run build:lib:client         # 编译并打包全部客户端包
cd ..

# 2. 把新 bundle 拷入扩展插件包
node scripts/copy-clients.mjs

# 3. 编译扩展并启动 Extension Development Host
npm run compile
code --extensionDevelopmentPath="$PWD" <文件夹>
```

> `.dsh-src/`（约 1.6 GB）与 `.tools/` 不提交到 git，仅在需要重建客户端 bundle 时按
> `patches/README.md` 获取，用完可随时删除——运行时读取的是 `dshui-plugins/` 中的预编译产物。
> 删除后失去的仅是「再次修改客户端行为」的能力。

### 跟随 dsh 版本升级

插件启动时会异步对比 npm 上的最新 `@deepseek-ai/dsh` 与内置版本（`dshui.checkDshUpdates` 控制，
默认开启；24 小时节流、同一新版本仅提示一次），内置版本过旧时通知——但提示仅为引导，升级仍需按
以下完整流程手动重打包安装插件。

扩展把三处 dsh 版本绑定在一起，升级时需要一起对齐：

1. **运行时与 host 源码**：`@deepseek-ai/*` 不再从 npm 下载，而是由 `.dsh-src` 构建产物填充
   （根 `package.json` 只声明一个锚点 `@deepseek-ai/dsh`，闭包是其清单的传递依赖；`preinstall`
   的 `sync-dsh` 先落好源码产物，`npm list`/`npm install` 不再走 registry）。dshui 对 host 的
   改动经 `patches/dshui-bundles.patch` 固化并烘焙进构建产物（当前 `0.2.1-alpha.1`）。
2. **客户端 bundle 的源码**：`.dsh-src` 检出（当前对应 `dsh-v0.2.1-alpha.1` 并重套 dshui
   客户端补丁——自 0.1.2 起上游重构了会话/聊天客户端，补丁需按 `scripts/verify-patches.mjs`
   重新套用到新结构；由于仓库 master 可能落后于 npm 发布，对齐方式是查看各包 `package.json`
   的版本号，并以实际运行测试为准）。
3. **插件清单的 peerDependencies**：dsh 0.2.1-alpha.1 起，`app-boot` 会读取每个插件行的
   `peerDependencies`，凡是 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 的范围不满足当前运行时
   （`semver.satisfies(..., { includePrerelease: true })`）就**直接禁用该行**并在 stderr 打印
   `Plugin <name>@<version> is incompatible with dsh <runtime>: peerDependencies {...}`。升级后必须
   把 `plugins/*/package.json` 里这些范围抬到新版本线（本次统一为 `>=0.2.1-0 <0.3.0-0`），
   否则插件静默不加载。插件侧的完整说明见 `plugins/plugin-development-guide.md`（§3 包清单）。

升级步骤：

```sh
# 0. 重新检出与目标版本对齐的源码——基提交固定为 patches/README.md 中的值
git clone https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
cd .dsh-src && git fetch origin <基提交> && git checkout FETCH_HEAD \
  && git apply --3way ../patches/dshui-bundles.patch   # 换基用 --3way：只标出真冲突的 hunk
# 注意：改动必须提交（或至少留在工作树）后再导出补丁；上游 pre-commit 的
# 「third-party notices」钩子会因 dshui 改了 bundle id 而失败，提交时加 --no-verify。

# 1. 在 .dsh-src 内安装依赖并构建（host + client）
#    换基升级必须先 clean：上一版留在 lib/types 与 *.tsbuildinfo 里的 typert remote 声明
#    是陈旧的，不清掉 tsc -b 会复用旧产物并抛大量「remote 方法不存在」的假错误。
pnpm install && pnpm run clean \
  && pnpm run build:lib:host && pnpm run build:lib:client \
  && pnpm run gen-client-catalog   # 槽目录跟随 ui-chat 的槽声明重新生成

# 2. 检查补丁是否仍完整——核心一步（在扩展根目录）
cd .. && node scripts/verify-patches.mjs   # 逐个标记缺失即说明该文件需要重新套用补丁
#    改动已固化为 patches/dshui-bundles.patch：对基提交能干净应用则直接使用；
#    出现漂移则按步骤 3 的清单重套，并重新导出（--binary 不可省，见下）：
#    git -C .dsh-src diff --binary <基提交> > patches/dshui-bundles.patch
#    注意基提交必须与 Makefile 的 DSH_BASE 及 patches/README.md 的 SHA 一致：用旧基提交导出
#    会把整版上游差异一起装进补丁（rc.1 基提交那次是 3447 文件 / 15.2 MB），补丁随即不可用。

# 3. 缺失的补丁按以下清单重新套用（改动都很小，按文件内注释即可）
#    - ui-workspace/src/client/tree.ts                 加 scopedWorkspacePath 与各 derive 的 scope / deletedSessionIds 参数
#    - ui-workspace/src/client/rows/WorkspaceBrowser.tsx  scopedWorkspacePath + useDeletedSessions 接线、会话删除行隐藏
#    - ui-workspace/src/client/contract/slots.ts       DeleteSessionInjected 与 deletedSessions 可观察量
#    - ui-workspace/src/client/index.ts                deleted-sessions store + deleteSession：postMessage 请扩展宿主删除日志文件
#    - ui-workspace/src/client/session-actions/DeleteSession.tsx  0.1.7 起会话行操作是 slot 条目：注册「删除会话」
#    - ui-workspace/src/client/locales.ts              新增 menu.deleteSession / actions.delete
#    - ui-workspace/tsdown.config.ts                   bundle id 改为 dshui-client-ui-workspace
#    - ui-conversation/src/client/skeleton/dshui-scope.ts          SCOPE 常量（DSHUI_SCOPE）
#    - ui-conversation/src/client/skeleton/ConversationMainPanel.tsx  data-dshui-scope 根标记
#    - ui-conversation/src/client/skeleton/ConversationContent.tsx    静态 chip、hero 隐藏、scope 下输入框恒不 inert
#    - ui-conversation/src/client/skeleton/EmptyHero.tsx              WorkspaceChip 的 staticChip prop
#    - ui-conversation/src/client/skeleton/ConversationRoot.module.css  scoped hero 贴底
#    - ui-conversation/src/client/skeleton/HeroShell.module.css       .workspaceStatic
#    - ui-conversation/tsdown.config.ts                bundle id 改为 dshui-client-ui-conversation
#    - ui-conversation/src/client/apply.ts             concreteConversation 返回 ConversationController|undefined；
#                                                      selectWorkspace 处显式判空抛错，composer 注入在服务未就绪时降级为「无态」姿态（不占死槽位）
#    - ui-chat/src/client/chat/MessageItem.tsx         UserMessageNodeView / SteeringMessageNodeView 拆分与 user-actions 子槽、markdown 链接投影（含 #L10/:10 行号）
#    - ui-chat/src/client/chat/register-node-renderers.ts  user 带 user-actions 子槽、steering 用无槽渲染器
#    - ui-chat/src/client/contract/slots.ts            UserActionOwnerProps 与 conversation.chat.user-actions 槽声明
#    - packages/client/tsdown.client.ts                workspaceManifest 对 dshui-client-* id 按包目录回退（rc.1 起按包名校验）
#    - packages/util/native-command/src/path-opener.ts  darwin 分支改桥接/CLI/vscode://file + dshuiOrigin/dshuiLine（行号经桥接 line 参数）
#    - packages/client/connection/src/browser-auth.ts     索引两条 303 重定向（token 交换 / 已认证但 token 失配）保留 dshui 查询参数
#    - packages/api/session-controller/src/{index,types}.ts  openWorkspacePath 透传 dshuiOrigin/dshuiLine；verifyDesktopPath 用 dshuiHomePath 展开 ~
#    - packages/api/settings-controller/src/index.ts         openSettingsDocument(dshuiOrigin, signal)
#    - packages/client/ui-chat/src/client/apply.ts           客户端附上窗口作用域 dshuiClickOrigin；dshuiOpenPath 决定链接目标拼写（相对 → 会话 cwd，家目录 → 保留 ~）
#    - packages/mcp/mcp-client/src/index.ts                  startup: eager|lazy

# 4. 重建并拷入
pnpm run build:lib:host && pnpm run build:lib:client   # 在 .dsh-src 内
pnpm run build:web                                     # 浏览器 shell（勿漏，见下方风险点）
pnpm run gen-client-catalog                            # 槽目录（唯一生成物，勿手改）
node scripts/sync-dsh.mjs                              # @deepseek-ai/* 拷入 node_modules
node scripts/copy-clients.mjs                          # 两个 UI 包的 client.js 覆盖进该闭包（须在后）

# 5. 重新编译扩展并打包（vscode:prepublish 会再跑 sync:dsh + copy:clients）
npm run compile && npx @vscode/vsce package
```

其他随版本漂移的风险点（升级后应逐项检查）：

- **`@deepseek-ai/dsh-web-frontend` 的浏览器 shell（`apps/web/dist`）必须重建**：`pnpm run build:lib`
  只构建 host/client 库，**不含** `pnpm run build:web`。shell 是客户端插件运行的页面，里面打包了它们运行时
  `require` 的共享模块（`react`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives` …）。
  shell 停在旧版本时，新版插件会全部加载失败：浏览器弹 **Failed to load plugins**，典型报错
  `settingsNumberField is not a function`（0.1.7 的 settings 卡片调用了旧 shell 里没有的新 API），而
  host 侧日志一切正常。`scripts/sync-dsh.mjs` 现在会做新鲜度检查：`dist` 比 `src` 旧时直接报错并提示
  `cd .dsh-src && pnpm run build:web`（跳过请设 `DSHUI_ALLOW_STALE_WEB=1`）。

- **构建顺序：`build:lib:host` → `build:lib:client` → `build:web` → `sync:dsh` → `copy:clients`**：
  - host 构建会顺带重新生成 typert 的 `lib/typert.remote-client.d.ts`。只跑 `build:lib:client` 时，
    client 会拿到旧签名（例如 `openSettingsDocument(signal?)`）而补丁里的新调用点
    （`openSettingsDocument(dshuiOrigin, signal)`）直接类型报错——改过 host 服务签名后必须先跑 host。
  - `copy:clients` 校验产物 bundle 的注册 id 是否等于 `dshui-client-ui-*`：不相等即说明 client 包没重建
    （bundle 仍带上游 id），此时对应行无法加载并连带拖垮 20 多个依赖者，脚本直接报错而不是静默打包。
  - 替换 UI 用的是「换 bundle id + 停用原生行 + 插入新行」，不是「保留原行只换文件」：后者会让
    `patch.yml` 的行名与包名不匹配而被 loader 跳过。

- **`patches/dshui-bundles.patch` 的 host 部分**：定位的是 `packages/util/native-command/src/path-opener.ts`
  的 darwin 打开分支、`packages/client/connection/src/browser-auth.ts` 的索引重定向（保留工作区
  作用域查询参数），以及
  `packages/api/session-controller/src/commands.ts` 里 `session.fork` 建子会话后清空继承队列的那一步，
  并依赖服务器环境变量 `DSHUI_OPEN_ENDPOINT`（扩展启动桥时注入）、`DSHUI_CODE_CLI`（应用内 `code`
  CLI 路径，桥不可用时的回退）与 `DSHUI_BRIDGES_FILE`。dsh 若修改该段代码，补丁会安全失败（`git
  apply` 报错），按新源码重写即可；桥接不可用时会自动回退 `vscode://file`。
- **重导补丁必须带 `--binary`，基提交必须同步换**：补丁的基提交固定为 dsh `0.2.1-alpha.1`
  （`5badb150…`，见 `patches/README.md` 与 Makefile 的 `DSH_BASE`），导出命令是
  `git -C .dsh-src diff --binary <基提交> > patches/dshui-bundles.patch`（`make dsh-gen-patch` 已内置）。
  两点都踩过坑：不加 `--binary` 时 `git diff` 对基提交里新增的 PNG/ICO 只写
  `Binary files ... differ` 占位（不含内容），`git apply` 会报 `cannot apply binary patch ... without
  full index line` 并**整体拒绝**补丁；不改 `DSH_BASE` 而用旧基提交导出，会把整版上游差异一起装进
  补丁（rc.1 基提交那次导出成 3447 文件 / 15.2 MB，而正常是 53 文件 / 约 170 KB）。
- **`scripts/sync-dsh.mjs`**：拷贝 `@deepseek-ai/dsh` 运行时闭包含的包；若某包在 `.dsh-src`
  未构建出 `lib/`，脚本会告警列名，此时不要打包发布。
- **升级 dsh 版本后不能只用 `make sync`**：`make sync` 只覆盖 `out/`、`dshui-plugins/`、`patch.yml`、
  `package.json`，**不动 `node_modules/@deepseek-ai`**。宿主闭包仍是旧版时，新版客户端 bundle 会加载
  失败（浏览器报 `Failed to load plugins`，例如 `settingsNumberField is not a function`）。请改用
  `make deploy` 完整重装。`make install` 末尾会自动运行 `scripts/clean-profile-links.mjs`，清掉旧版
  link backend 留在 `$DSH_HOME/profiles/node_modules` 里指向上一版扩展的软链（指向旧版的可用软链会
  遮蔽新版包，悬空软链则直接解析失败）；该脚本可随时手动执行（`--dry-run` 只预览），换版后建议再跑。
- **`patch.yml`**：覆盖的行 id（`ui-workspace` / `ui-conversation`）与插入的
  `dshui-host-ensure-workspace` 依赖 `web-app` bundle 中的行名与 `workspaceRegistry` / `webServer`
  服务名；这些若有变化，需同步更新。
- **`patch.yml` 的沙箱缝隙必须成对出现**：`bash-sandbox` / `fs-sandbox` 是
  `shell` / `fs` 两个服务的唯一提供者，`dsh-whitelist-sandbox` 行是用白名单子类接手的替换实现。
  只把前者 `disabled: true` 而把后者的 insert 注释掉（或反过来只 insert 不停用），会得到一个
  「能启动但半死」的服务端：会话列表加载不出来、设置页报错、插件面板显示 `tool-bash: waiting for
  shell`、`tool-fs: waiting for fs`，且 `present`、`workflow-ptc`、`tool-workflow`、`permission`、
  `session-controller`、`workspace-files` 等全部停在 PENDING。`scripts/verify-overlay.mjs` 会在
  `make package` / `make deploy` / `make sync` 这一步拦下这种组合，并顺带校验每个 insert 行都指向
  真实存在的 `dshui-plugins/<name>`。**该配对不在本 overlay 的 `patch.yml` 里**：白名单插件由
  `installPlugins()` 的 `ensureProfileBundle()` 挂成 **profile bundle**，其自身的
  `cordis.patch.yml` 在同一层完成「停用原生 + 插入白名单」；因为设置页要通过 `configEditor` 编辑该行
  的 `extraWritableRoots`，而 overlay 层在 profile 层之后应用，行插在 overlay 里会让每次保存都被判为
  「overridden by a home patch or command-line overlay」。
- **白名单的 operator 私有路径不写进本仓库**：`extraWritableRoots` 属于运维数据，放
  `$DSH_HOME/profiles/web/cordis.patch.yml`。注意补丁层是「后层整体覆盖前层」的语义：profile 层
  在本 overlay **之前**应用，既不能给 overlay 插入的行配 config，也无法覆盖 overlay 已给的
  `config:`，所以该 insert 行在启用时必须不带 `config:`，把 roots 留给用户层。
- **`dshui-plugins/*/package.json`**：`dsh.client.inject` 列表仅为信息性依赖边，一般无需改动；
  但 `peerDependencies` 里的 `@deepseek-ai/dsh-*` 范围是**强制门禁**（见上文升级第 3 点），
  升级 dsh 后必须同步抬高。
- **升级 dsh 后插件源码要重新对齐**：`plugins/*` 下的插件源码不在本仓库，改完要 `make stage`
  才能进 `dshui-plugins/`。本次 0.2.1-alpha.1 升级的三件事：
  1. `dsh-capability-toggle-plugin` 是自带 pnpm `node_modules` 的第三方仓库（其余插件是到本仓库
     `node_modules` / `.dsh-src/packages` 的软链），要把 `node_modules/@deepseek-ai/*`（含
     `cordis`）整体重指到本仓库的 0.2.1 产物再 `make typecheck`，否则类型检查跑的还是上一版 dts；
     两份 cordis 会让 `Context` 声明合并失效，报出一大堆 `Property 'tools' does not exist`。
  2. 它 `test/pure.test.ts` 里有一条断言 peer 范围的用例（`mustAdmit` / `mustReject`），
     改范围要同步改该用例。
  3. `dsh-im` 的 `package.json` 里 `dsh.compatibility.dshReleases` 记录已验证的 dsh 版本，一并更新。
- **数据兼容**：dsh 处于预发布（rc）阶段，升级可能改变持久化格式（`~/.dsh` 下的
  sessions/storages）。升级前留意 release 说明；必要时备份 `~/.dsh`。

## 注意事项

- 内嵌服务器与浏览器 UI 共用 `~/.dsh`。**不要同时运行浏览器 UI 与扩展**——dsh 磁盘状态不是多进程
  安全的。

## 贡献

欢迎提交 issue 与 pull request：

- 报告缺陷或功能建议：请附上 VS Code 版本、扩展版本、操作系统与复现步骤。
- 开发相关细节（补丁、构建、测试）参见[开发流程](#开发流程)。
- 欢迎补充使用截图与文档改进。

## 反馈

- 问题跟踪：[GitHub Issues](https://github.com/leathong/dshui-for-vscode/issues)
- 上游项目：[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

## 许可证

[MIT](LICENSE)。上游 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 亦为
MIT 协议。随扩展分发的第三方插件 `dsh-capability-toggle-plugin`（作者 lifeopsgo）同为 MIT 协议；
[`@xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im)（作者 xmanrui）同为 MIT 协议，其许可证与
第三方组件声明见 `dshui-plugins/@xmanrui/dsh-im/` 下的 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。
