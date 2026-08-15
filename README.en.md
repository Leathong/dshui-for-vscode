# dsh UI for VS Code

> English · [中文](README.md)

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Getting Started](#getting-started)
  - [Commands](#commands)
  - [Settings](#settings)
  - [Referencing Files and Code Selections](#referencing-files-and-code-selections)
  - [Opening Files](#opening-files)
  - [Network Links in Messages](#network-links-in-messages)
  - [Multiple Windows (Shared Backend)](#multiple-windows-shared-backend)
- [How It Works](#how-it-works)
- [Development](#development)
  - [Three Tiers of Iteration](#three-tiers-of-iteration)
  - [Upgrading with dsh Releases](#upgrading-with-dsh-releases)
- [Important Notes](#important-notes)
- [Contributing](#contributing)
- [Feedback](#feedback)
- [License](#license)

## Introduction

[dsh UI for VS Code](https://github.com/leathong/dshui-for-vscode) is a VS Code extension that embeds
the web UI of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`, DeepSeek's
open-source agentic coding framework — "everything is a plugin") into the VS Code sidebar, so agent
sessions and your coding workflow live in the same window.

The core idea: **the folder you have open in VS Code IS the dsh workspace**. The extension starts an
embedded `dsh web` server with that folder as its working directory (the CLI runtime ships inside the
extension, so no separate Node installation is needed) and registers it as a persistent dsh Workspace.
All dsh capabilities — session chat, tool cards, goals, subagents, background tasks — work as-is, with
a deeply integrated VS Code experience on top.

<p align="center">
  <img src="media/screenshot.png" alt="dsh UI embedded in the VS Code sidebar" width="90%">
  <br>
  <em>dsh UI embedded in the VS Code sidebar: the opened folder is the workspace, the input box stays
  pinned to the bottom, and the sidebar lists only the current workspace's sessions.</em>
</p>

## Features

Compared with the stock browser UI, this extension differs in four main ways:

1. **No workspace selection.** The opened folder is the workspace: the extension starts the
   `dsh web` server with it as the working directory and registers it as a persistent Workspace, so a
   usable session is available as soon as the view opens.
2. **The sidebar lists only the current workspace's sessions.** Other workspaces, the Ungrouped
   bucket, grouping/sorting view options, and the "add workspace" action are hidden — everything you
   see belongs to the folder you have open.
3. **The input box stays pinned to the bottom.** The centered "new session" hero is removed; the
   composer is fixed at the bottom in every state, like an active session.
4. **The session menu deletes instead of archiving.** Deleting is performed by the extension host via
   the VS Code file API, which removes the session log files under `~/.dsh/sessions/...` directly
   (bypassing dsh's archive RPC; dsh itself is unchanged).

Everything else from the dsh web UI is preserved: session chat, tool cards, goals, subagents, settings,
model selection, background tasks, feedback, and more. On top of that, the extension provides several
deep VS Code integrations:

- **Theme following:** `prefers-color-scheme` inside the webview follows the VS Code theme rather than
  the OS, so the **system** preference in appearance settings resolves to "follow the VS Code theme";
  manually choosing dark/light still takes priority. When opened in a system browser, it still follows
  the OS.
- **File opening:** file links in chat open in **the current VS Code** window with no system
  confirmation popup (see [Opening Files](#opening-files)).
- **Referencing files and code selections:** right-click to insert a file reference or the selected
  code into the input box (see
  [Referencing Files and Code Selections](#referencing-files-and-code-selections)).
- **Shared backend across windows:** all windows reuse a single embedded server — no port conflicts,
  consistent session data (see [Multiple Windows (Shared Backend)](#multiple-windows-shared-backend)).

## Requirements

- VS Code ≥ 1.85
- No separate Node installation: the extension runs the dsh CLI with the Node bundled inside the
  extension host (`ELECTRON_RUN_AS_NODE`).
- A local Node ≥ 22.19 and pnpm 11.7.0 are only needed when **rebuilding the client bundles from
  source** (see [Development](#development)).

## Installation

**Option 1: install the prebuilt package** (recommended; ships the dsh runtime, ~60 MB)

Release packages are published on [GitHub Releases](https://github.com/leathong/dshui-for-vscode/releases):

```sh
code --install-extension dshui-for-vscode-0.1.0.vsix
```

**Option 2: package from source**

```sh
npm install
npm run compile                       # TypeScript → out/
npx @vscode/vsce package              # produces dshui-for-vscode-<version>.vsix
```

> Packaging from source does **not** require the upstream source: `.dsh-src/` and `.tools/` are not
> committed and don't exist in a fresh clone; `scripts/copy-clients.mjs` skips them automatically when
> the checkout is missing and uses the prebuilt client bundles shipped with the package.

For development, press **F5** (the repo ships `.vscode/launch.json`), or run
`code --extensionDevelopmentPath="$PWD" <folder>`.

## Getting Started

1. Install the extension (`dshui-for-vscode`).
2. Open a folder — that folder becomes the dsh workspace.
3. The dsh UI appears in the sidebar (activity bar icon → **dsh**); it opens automatically when you
   open a folder (disable with `dshui.autoOpen`, reopen with the **dsh UI: Open** command).
4. Use the input box at the bottom. Sessions persist per folder in your dsh home (`~/.dsh`, shared
   with the browser UI).

### Commands

| Command | Description |
| --- | --- |
| `dshui.open` | Show the dsh UI view in the sidebar |
| `dshui.openInBrowser` | Open the same scoped server in the system browser |
| `dshui.referenceFile` | Insert a file reference into the dsh input box (Explorer / editor / editor tab context menus) |
| `dshui.referenceFolder` | Insert a folder reference into the dsh input box (Explorer context menu) |
| `dshui.referenceSelection` | Insert the selected code (with line numbers) into the dsh input box (editor context menu) |
| `dshui.restartServer` | Restart the embedded dsh server and refresh the sidebar view (also the ⟳ button in the view title bar; equivalent to starting when the server is not running) |

> Restarting the server interrupts in-flight agent tasks (session data persists in `~/.dsh` and is not
> lost). Under the shared backend, if the server was started by **another window**, a confirmation
> dialog explains the impact on other windows first; after confirming, this window takes over: the
> original listening process is terminated and a new one is started on the same port as the new owner.
> Other windows keep their URLs and recover automatically after a reload. Use this command to apply
> changes to settings such as `dshui.server.port` immediately, without reloading the window.

### Settings

| Setting | Default | Description |
| --- | --- | --- |
| `dshui.autoOpen` | `true` | Automatically show the sidebar view when a folder is opened |
| `dshui.server.port` | `61370` | Port of the embedded server. The fixed port doubles as the shared-backend rendezvous: all windows reuse ONE server (each scoped via `?dshui_workspace`), and localStorage is scoped per workspace so each folder remembers its own last-opened session across launches. Set to `0` for an OS-assigned port (no sharing, no persistence). Falls back to a random port when the port is taken |
| `dshui.openFilesInVscode` | `true` | Open file links from chat in **the current VS Code** window (via the extension's bridge, no system popup) instead of the OS default editor |
| `dshui.checkDshUpdates` | `true` | Check the npm registry for newer dsh releases at startup and notify when the bundled version is outdated (throttled to once per 24h; each new version is announced once; can be disabled) |

### Referencing Files and Code Selections

Right-click a file or **folder** in the **Explorer**, or right-click an **editor tab** →
**Add File to dsh** / **Add Folder to dsh**; or select code in the **editor** and right-click →
**Add Selection to dsh**. The reference is inserted into the sidebar input box as message text (the
sidebar view is focused automatically):

- File / folder reference: `[src/extension.ts](src/extension.ts)` / `[src/components/](src/components/)` —
  a standard markdown link (relative path). The agent reads or lists the target with its own tools, so it
  costs no input-box space.
- Code selection reference: `[src/extension.ts#L10-L20](src/extension.ts#L10-L20)` + a code block —
  the path, line numbers (GitHub-style `#Lx-Ly` anchors), and the selected code are handed to the
  agent together. Very long selections (> 20,000 characters) are truncated with a note pointing to the
  full path.

References are not lost while the panel is still starting up: the webview shell buffers them and writes
them into the draft once the dsh SPA is ready; while the input box is busy (submitting), insertion
waits until it is writable again.

### Opening Files

File links in chat open in **the current VS Code** window by default, with **no system confirmation
popup**:

- The extension runs a local HTTP bridge (127.0.0.1, random port, lifecycle tied to the extension) and
  applies an idempotent patch to the api-proxy so "open file" requests are handed to the bridge, which
  opens the file via the **VS Code API**.
- Under the shared backend, each window registers its workspace and bridge in
  `$DSH_HOME/dshui-bridges.json`; the patch routes by "longest-prefix workspace of the opened path" to
  the bridge of **the window where the file was clicked**. Edge cases (paths outside any workspace,
  multiple windows on the same directory) fall back to the owner's bridge.
- When the bridge is unavailable, the fallback chain is: the `code` CLI (in-app paths are passed to the
  server via `DSHUI_CODE_CLI`, which opens the running VS Code through the CLI socket protocol, also
  without a confirmation popup) → `open vscode://file/...` (with a confirmation popup).
- `.html` / `.pdf` still open in the system browser; disable with `dshui.openFilesInVscode` (restores
  the OS default handler).

### Network Links in Messages

**http/https links** (including `mailto:`) in chat messages open in the **system browser** by default.
dsh renders these links as `<a target="_blank">`, which opens a new tab in a normal browser but is
blocked by the VS Code webview (no `window.open`/popups), so clicks used to do nothing. A capture-phase
click interceptor in the injected host-plugin script now routes such clicks: click → relayed through the
webview shell → extension host → `vscode.env.openExternal` opens the system browser. Modifier clicks
(Cmd/Ctrl/Shift/Alt+click) are left to VS Code's own handling; non-http(s) destinations (e.g.
`javascript:`) are not intercepted.

### Multiple Windows (Shared Backend)

The fixed port (default 61370) doubles as a rendezvous: when a second window activates, it probes the
port and, if a dshui server is already there, reuses it instead of starting a new process. It registers
its own folder through a marker in `$DSH_HOME/dshui-workspaces/`, and the webview connects with
`?dshui_workspace=<folder>`; the host plugin resolves scope per connection. Lifecycle:
`$DSH_HOME/dshui-server.json` records the pid of the window using the server, the server starts
detached (it outlives the window that started it), the host plugin polls the registry and exits when no
window is alive. An adopter that finds no registry yet (the owner window is still registering during
startup) creates it and registers itself instead of being silently dropped, and the owner's close-time
check decides by the registry whether other windows are still using the server — the startup race no
longer stops the shared server under the other windows. As a result, windows over the same or different
workspaces share one backend, only one
process ever writes to `~/.dsh`, there are no more EADDRINUSE conflicts, and the multi-process shared
disk-state warning from dsh's upstream README is avoided.

Notes:

- **File opening:** each window registers its own bridge (`dshui-bridges.json`, cleaned by pid
  liveness), and the patch routes by the workspace prefix of the opened path — a file opens in
  **whichever window** its workspace belongs to. Edge cases fall back to the owner's bridge: paths not
  under any registered workspace (e.g. `/tmp/...`), or two windows on the same folder (indistinguishable;
  the most recently registered one wins). When the owner closes and its bridge is gone, the fallback is
  the `code` CLI (opens in the **most recently focused** VS Code window, no popup), then
  `vscode://file` (with a confirmation popup).
- **Per-workspace localStorage:** an injected patch namespaces every localStorage key by the
  workspace scope (resolved from `?dshui_workspace`), so each workspace remembers its own last-opened
  session and view state and never sees another workspace's. Windows on the same folder still share
  (reload restores within the workspace); a plain browser hit on the server root without a workspace
  query keeps stock unscoped behavior.
- Sharing only applies on the fixed port (the default); with `dshui.server.port = 0`, every window
  starts its own server on a random port.

## How It Works

```
VS Code sidebar view (webview)
  └── <iframe src="http://127.0.0.1:<port>">     ← stock dsh SPA (independent browser semantics)
        └── talks to the dsh server started by the extension via /api
```

- **Server:** the extension bundles the real `@deepseek-ai/dsh` CLI as a runtime dependency and starts
  `dsh --profile web` with the opened folder as cwd (port: see `dshui.server.port`, fixed 61370 by
  default; pre-started at activation to avoid a blank view while loading).
- **Restoring the last session:** localStorage keys are scoped per workspace (see the note above), so
  each folder restores its own last session on the next launch; with no history, it falls back to a
  blank new session. When the port is taken, it falls back to a random port (no persistence that run).
- **Plugin loading:** on activation, three dshui plugins are installed into
  `$DSH_HOME/profiles/node_modules` (with the extension's own `node_modules` as a loader fallback) and
  wired in through the `--patch` overlay (see `patch.yml`):
  - `dshui-host-ensure-workspace` — the host plugin: registers the working directory as a Workspace at
    startup and injects `window.__DSHUI_WORKSPACE__` (the scope path), a `CSS_OVERRIDES` rebuild-free
    style overlay (including font-size normalization), a VS Code theme takeover patch (shadow
    `matchMedia`; see the "Theme following" bullet below), a Cmd/Ctrl+C copy handler (the VS Code
    webview intercepts copy shortcuts inside iframes — see
    [microsoft/vscode#129178](https://github.com/microsoft/vscode/issues/129178) and
    [microsoft/vscode#180234](https://github.com/microsoft/vscode/issues/180234)), a Cmd/Ctrl+N new
    session handler (intercepts the workbench "New Window" shortcut and routes it to the sidebar "New
    Session" button), and a file/code reference writer (receives reference messages forwarded by the
    webview shell from the extension's context-menu commands and writes them into the composer draft).
  - `dshui-client-ui-workspace` / `dshui-client-ui-conversation` — **rebuilt artifacts** of the two
    stock client packages, containing the sidebar filtering, the bottom-pinned input box, and the
    "Delete Session" menu (deletion goes through the webview shell → the extension host via the VS
    Code file API).
- **Deleting sessions:** dsh itself only offers "archive" (hide the session, keep the files) and has no
  delete RPC. The plugin renames the session-row menu entry from "Archive Session" to "Delete Session":
  on click, the plugin posts a message to the webview shell (`dshui:deleteSession`, with the session id
  and its workspace directory), and the shell forwards it to the extension host. The host resolves the
  session directory using dsh's session path rules (`$DSH_HOME/sessions/<encoded workspace dir>/<session
  id>/`, matching the `projectKey`/`encodeSegment` of `dsh-session-persistence-jsonl`) and deletes its
  log files with the **VS Code file API** (`vscode.workspace.fs.delete`, recursive), then reports the
  result back through the shell (`dshui:sessionDeleted`). On confirmation the plugin hides the row (the
  session is gone by the next `session.list`); if the deleted session was the current one, it returns
  to the "new session" view. Outside VS Code (e.g. opened in a system browser) or when the host is
  unresponsive (15-second timeout), deletion fails and the row is kept.
- **Theme following:** `prefers-color-scheme` inside the webview iframe normally follows the OS, which
  may disagree with the VS Code theme (`workbench.colorTheme`). On every view load and theme change,
  the extension passes the current color scheme (Dark/HighContrast → dark, everything else → light) to
  the SPA through the shell and the `dshui_theme` URL parameter; the host plugin's injected patch
  shadows `matchMedia` for that one query — so the **system** preference in appearance settings
  resolves to "follow the VS Code theme" instead of the OS; manually choosing dark/light still takes
  priority. Opening in a system browser (`dshui.openInBrowser`) carries no such parameter and still
  follows the OS.

## Development

### Three Tiers of Iteration

The webview renders the **stock dsh SPA** (upstream code from the deepseek-harness repository); the
sidebar/input-box changes are not upstream — they live in two "client plugin bundles" that are rebuilt
from the upstream client packages with the dshui changes injected, shipped as **prebuilt artifacts**
(`dshui-plugins/`), and loaded by the dsh server from installed packages.

Changes to the upstream client source are published with the repo as a patch:
`patches/dshui-client-bundles.patch` (15 files covering `ui-workspace` / `ui-conversation` and their
tests; base commit is pinned — see `patches/README.md` for the apply steps). Upstream source
(`.dsh-src`) and build tooling (`.tools/`) are **not committed to git**.

| What to change | Where | Rebuild needed? |
| --- | --- | --- |
| Extension logic (server, webview, commands, settings) | `src/*.ts` | `npm run compile`, then F5 |
| **Visual tweaks** (spacing, colors, bottom pinning, hidden elements) | `dshui-plugins/dshui-host-ensure-workspace/index.js` → the `CSS_OVERRIDES` list | **No** — just reload the window |
| Client behavior (filtering, hero flow, component logic) | `.dsh-src/packages/client/ui-workspace` / `ui-conversation` (TypeScript; fetch the source per `patches/README.md` first) | Full client rebuild (below) |

After editing the browser scripts injected into the page from
`dshui-host-ensure-workspace/index.js` (reference writing / theme takeover), run the built-in behavior
smoke tests before reloading the window:

```sh
node scripts/check-reference-patch.mjs && node scripts/test-reference-patch.mjs
node scripts/check-theme-patch.mjs && node scripts/test-theme-patch.mjs
```

Day-to-day changes to extension logic or styles do **not** require the source checkout; only
structural changes to the dsh client code need a full rebuild:

```sh
# 0. Fetch the upstream source and apply the dshui patch (source is not committed;
#    base commit and full commands are in patches/README.md)
git clone https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
cd .dsh-src
git fetch origin <base commit from patches/README.md> && git checkout FETCH_HEAD
git apply ../patches/dshui-client-bundles.patch   # fails safely if the base commit mismatches
cd ..

# 1. Build the changed client bundles from source
cd .dsh-src
pnpm install                      # requires pnpm 11.7.0, Node ^22.19 || >=24
pnpm run build:lib:host           # generates the shared /remote modules
pnpm run build:lib:client         # compiles and packages all client packages
cd ..

# 2. Copy the new bundles into the extension's plugin packages
node scripts/copy-clients.mjs

# 3. Compile the extension and launch the Extension Development Host
npm run compile
code --extensionDevelopmentPath="$PWD" <folder>
```

> `.dsh-src/` (~1.6 GB) and `.tools/` are not committed to git and do not exist in a fresh clone. They
> only matter when rebuilding the client bundles: fetch them per `patches/README.md` and delete them
> anytime — the runtime reads the prebuilt artifacts in `dshui-plugins/`. Removing them only costs you
> the ability to modify client behavior again.

### Upgrading with dsh Releases

At startup the plugin asynchronously compares the latest `@deepseek-ai/dsh` on npm with the bundled
version (controlled by `dshui.checkDshUpdates`, on by default; throttled to once per 24h, each new
version announced once) and notifies when the bundled version is outdated — but the notification is
only a hint; upgrading still requires manually repackaging and reinstalling the extension via the full
workflow below.

The extension binds two dsh versions together, and both must be aligned on upgrade:

1. **CLI runtime:** `dependencies["@deepseek-ai/dsh"]` in `package.json` (currently `0.1.0-rc.6`).
2. **Client bundle source:** the `.dsh-src` checkout (currently a commit near the rc.6 release; since
   the repo's master may lag behind the npm release, align by checking each package's version in its
   `package.json` and confirm with real runtime tests).

Upgrade steps:

```sh
# 0. (Optional) Re-checkout source aligned with the target version — the base commit is pinned to the
#    value in patches/README.md
#    git clone https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
#    cd .dsh-src && git fetch origin <base commit> && git checkout FETCH_HEAD && git apply ../patches/dshui-client-bundles.patch

# 1. Upgrade the bundled CLI
npm install @deepseek-ai/dsh@<new version>

# 2. Check that the patch is still complete — the core step
node scripts/verify-patches.mjs      # each file flagged as missing needs its patch re-applied
#    The changes are frozen in patches/dshui-client-bundles.patch: if it applies cleanly to the base
#    commit, use it as-is; if it drifted, re-apply per the checklist in step 3 and re-export with:
#    git -C .dsh-src diff > patches/dshui-client-bundles.patch

# 3. Re-apply any missing patches per the checklist below (the changes are small; follow the comments
#    in each file)
#    - ui-workspace/src/client/tree.ts                 add scopedWorkspacePath, scope params to derives, deletedSessionIds
#    - ui-workspace/src/client/WorkspaceBrowser.tsx    SCOPE constant, workspaces/ungrouped filtering, hide add/view options, rail sectionHeader, session-delete row hiding
#    - ui-workspace/src/client/contract/slots.ts       archiveSession → deleteSession
#    - ui-workspace/src/client/index.ts                session delete: postMessage asks the extension host to delete log files (15s timeout + listener cleanup)
#    - ui-workspace/src/client/rows/Rows.tsx           "Delete Session" menu (trash icon, danger style), onArchive → onDelete
#    - ui-workspace/src/client/locales.ts              menu.archiveSession → menu.deleteSession
#    - ui-workspace/tsdown.config.ts                   bundle id → dshui-client-ui-workspace
#    - ui-workspace/tests/{rows,workspace-browser,tree}.client.spec.*  session-delete tests
#    - ui-conversation/.../ConversationRoot.tsx        SCOPE constant, static chip, hero hiding, data-dshui-scope
#    - ui-conversation/.../EmptyHero.tsx               staticChip prop for WorkspaceChip
#    - ui-conversation/.../ConversationRoot.module.css  scoped hero pinned to the bottom
#    - ui-conversation/.../HeroShell.module.css        .workspaceStatic
#    - ui-conversation/tsdown.config.ts                bundle id → dshui-client-ui-conversation

# 4. Rebuild and copy in
pnpm run build:lib:host && pnpm run build:lib:client   # inside .dsh-src
node scripts/copy-clients.mjs

# 5. Recompile the extension and package
npm run compile && npx @vscode/vsce package
```

Other drift-prone spots to check after every upgrade:

- **`src/openPatch.ts`** (paired with `src/openBridge.ts`): the patch targets a string in the stock
  darwin-open branch of the api-proxy and depends on the server environment variables
  `DSHUI_OPEN_ENDPOINT` (injected by the extension when starting the bridge) and `DSHUI_CODE_CLI` (the
  in-app `code` CLI path, the fallback when the bridge is unavailable). If dsh changes that code, the
  patch skips safely and logs (`file opener patch: ... skipping`) — just rewrite the branch string for
  the new code; when the bridge is unavailable it automatically falls back to `vscode://file`.
- **`patch.yml`:** the overridden row ids (`ui-workspace` / `ui-conversation`) and the inserted
  `dshui-host-ensure-workspace` depend on the row names in the `web-app` bundle and on the
  `workspaceRegistry` / `webServer` service names; update them in sync if these change.
- **`dshui-plugins/*/package.json`:** the `dsh.client.inject` list is only an informational dependency
  edge; it usually needs no changes.
- **Data compatibility:** dsh is pre-release (rc); upgrades may change the persistence format
  (sessions/storages under `~/.dsh`). Watch the release notes before upgrading; back up `~/.dsh` when
  in doubt.

## Important Notes

- The embedded server and the browser UI share `~/.dsh`. **Do not run the browser UI and the extension
  at the same time** — dsh's on-disk state is not safe for multiple processes.

## Contributing

Issues and pull requests are welcome:

- To report a bug or suggest a feature, please include your VS Code version, extension version, OS,
  and reproduction steps.
- For development details (patches, builds, tests) see [Development](#development).
- Screenshots and documentation improvements are very welcome.

## Feedback

- Issue tracker: [GitHub Issues](https://github.com/leathong/dshui-for-vscode/issues)
- Upstream project: [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

## License

[MIT](LICENSE). The upstream [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) is
also MIT-licensed.
