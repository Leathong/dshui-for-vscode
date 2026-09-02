# dshui Source Patch

> English · [中文](README.md)

`dshui-bundles.patch` contains the dshui modifications to the source of
[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (26 files across the client
bundles and the host runtime). The client and the host must be **aligned** to the same base commit
and applied together, so they are merged into a single patch — applying only half is incomplete.

## Client bundles (browser SPA)

- `ui-workspace`: `tree.ts` (`scopedWorkspacePath`, the scope params on the derives, and the
  locally-deleted-session hide set), `WorkspaceBrowser.tsx` (the `SCOPE` constant,
  workspaces/ungrouped filtering, hidden add/view options, session-delete row hiding),
  `contract/slots.ts` (`archiveSession` → `deleteSession`), `index.ts` (session deletion requests the
  extension host — through the webview shell — to delete the log files),
  `rows/Rows.tsx` ("Delete Session" menu / trash icon / danger style, `onArchive` → `onDelete`),
  `locales.ts` (`menu.archiveSession` → `menu.deleteSession`), and `tsdown.config.ts` (bundle id →
  `dshui-client-ui-workspace`);
- `ui-conversation`: `apply.ts` (when a second shared-backend window re-binds a session the
  `conversation` service may read `undefined` — the old implementation threw and abdicated the
  composer slot once with no retry, permanently vanishing the composer until a window reload; it
  now degrades to the absent posture, and the next binding re-resolution restores the live
  composer), `ConversationRoot.tsx` (the `SCOPE` constant, the static chip, hero hiding,
  `data-dshui-scope`), `EmptyHero.tsx` (the `staticChip` prop of `WorkspaceChip`),
  `ConversationRoot.module.css` (scoped hero pinned to the bottom, composer kept during `settling`),
  `HeroShell.module.css` (`.workspaceStatic`), and `tsdown.config.ts` (bundle id →
  `dshui-client-ui-conversation`);
- `ui-chat` (separate package since 0.1.2 upstream split the session/chat client): `chat/MessageItem.tsx`
  (the user-message renderer is split into `UserMessageNodeView` and `SteeringMessageNodeView`; a user
  message embeds a `conversation.chat.user-actions` action strip anchored to its Turn, while a steering
  message does not; and it **preserves the markdown-link projection** on top of the upstream
  `projectUserText` reference-chip projection: `[label](destination)` with an allowlisted
  http/https/mailto URL renders as an external anchor, a destination `new URL` cannot parse renders as
  a file-open button through `openFile` resolved against the session cwd, and any other absolute URL
  stays literal), `chat/MessageItem.module.css` (the `.projectedText` inline flow and `.link` styles),
  `chat/ChatView.tsx` (passes `openFile` to the pending steering / submission bubbles),
  `chat/register-node-renderers.ts` (registers `UserMessageNodeView` — with the user-actions child
  slot — for `user`, and `SteeringMessageNodeView` for `steering`), `contract/slots.ts`
  (`UserActionOwnerProps` and the `conversation.chat.user-actions` slot declaration), and the specs
  `tests/chat-branch-tails.client.spec.tsx` and `tests/chat-view.client.spec.tsx` (the user-actions
  slot opens anchored to the Turn; steering has no such slot; markdown links open externally or via
  `openFile` for relative paths, and non-allowlisted URLs stay literal);
- `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`: catalogs the
  `conversation.chat.user-actions` slot entry (shown in the chat "slot catalog" docs).
- build preset: `packages/client/tsdown.client.ts` (`workspaceManifest` resolves `dshui-client-*`
  bundle ids by package directory — since rc.1 tsdown validates the bundle id against package names,
  while the dshui ids are the profile row names).

Effect: the sidebar lists only the current workspace's sessions, the input box stays pinned to the
bottom (no centered hero), the session menu reads "Delete Session" (the extension host deletes the
session log files under `$DSH_HOME/sessions/...` via the VS Code file API, bypassing dsh's archive
RPC), every user message carries an extensible action strip (`conversation.chat.user-actions`,
which the extension uses to mount "Rollback"), and markdown links in user messages are clickable
(external URLs open in the system browser, relative paths open the file in the current window). Chat
file links open in the host VS Code (darwin: local open bridge → `code` CLI → `vscode://file`, no
system dialog — see the host side below). At runtime the **prebuilt artifacts** at
`../dshui-plugins/*/client.js` are used; this patch exists to reproduce those artifacts from source.
The patch also includes the tests for the changes above (four specs under `tests/`).

## Host runtime (server side)

The string patches the extension once applied to the npm package at runtime (see the deleted
`src/openPatch.ts`) are now baked into the source and compiled in:

- `packages/util/native-command/src/path-opener.ts`: the `darwin` branch of `openNativePathWithIntent`
  now tries "local open bridge → `code` CLI → `vscode://file`", with new bridge/CLI/URL helpers
  (`dshuiOpenViaBridge` / `dshuiOpenViaCli` / `dshuiVscodeFileUrl` / origin-aware bridge selection),
  so chat file links open in the host VS Code (through the in-extension bridge, no system dialog);
  `PathOpenerInternals` gains `dshuiOrigin` so the click origin takes part in routing.
- `packages/client/connection/src/browser-auth.ts`: the 303 redirect of the token exchange keeps the
  `dshui_workspace` / `dshui_theme` query params (besides `launch`), so a shared-backend window keeps
  its workspace scope after the token exchange.

These two packages are filled into `node_modules/@deepseek-ai/*` from the **source-built artifacts**
by the extension's `scripts/sync-dsh.mjs`, instead of being downloaded from npm. The root
`package.json` declares only **one** anchor dependency `@deepseek-ai/dsh` (the rest of `@deepseek-ai/*`
are transitive deps in its manifest, so `npm list` accepts the whole closure without fetching from
the registry — the source artifacts are already in place). The runtime reads the **prebuilt artifacts**
in `node_modules/@deepseek-ai/*`; this patch reproduces them from source.

## Applying (the base commit is pinned)

The patch targets this base commit (**pinned; it must not drift**):

```
4e84901e6471b79ec0338099867ebb4606d12bb5
```

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
cd .dsh-src
git fetch origin 4e84901e6471b79ec0338099867ebb4606d12bb5 && git checkout FETCH_HEAD
git apply ../patches/dshui-bundles.patch            # fails safely if the base commit mismatches
pnpm install                                        # requires pnpm 11.7.0, Node ^22.19 || >=24
pnpm run build:lib:host
pnpm run build:lib:client
cd ..
node scripts/copy-clients.mjs                       # copies the client bundles into dshui-plugins/
node scripts/sync-dsh.mjs                           # copies the @deepseek-ai/* source artifacts into node_modules
npm run compile
```

## When Upstream Drifts

A failed `git apply` means the base commit has drifted — re-apply each change per the checklist in the
main [README, section "Upgrading with dsh Releases"](../README.en.md#upgrading-with-dsh-releases) (the
changes are small; follow the comments in each file). dsh is MIT-licensed, so this patch and its
artifacts may be freely modified and redistributed as long as the upstream copyright notice is kept.
