# dshui Client Bundle Patch

> English · [中文](README.md)

`dshui-client-bundles.patch` contains the dshui modifications to the client source of
[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (20 files across two packages):

- `ui-workspace`: `tree.ts` (`scopedWorkspacePath`, the scope params on the derives, and the
  locally-deleted-session hide set), `WorkspaceBrowser.tsx` (the `SCOPE` constant,
  workspaces/ungrouped filtering, hidden add/view options, session-delete row hiding),
  `contract/slots.ts` (`archiveSession` → `deleteSession`), `index.ts` (session deletion requests the
  extension host — through the webview shell — to delete the log files),
  `rows/Rows.tsx` ("Delete Session" menu / trash icon / danger style, `onArchive` → `onDelete`),
  `locales.ts` (`menu.archiveSession` → `menu.deleteSession`), and `tsdown.config.ts` (bundle id →
  `dshui-client-ui-workspace`);
- `ui-conversation`: `apply.ts` (attaches the click origin `dshuiOrigin` to `host.openPath` so a
  nested-workspace file opens in the window where it was clicked), `ConversationRoot.tsx` (the
  `SCOPE` constant, the static chip, hero hiding, `data-dshui-scope`), `EmptyHero.tsx` (the
  `staticChip` prop of `WorkspaceChip`), `ConversationRoot.module.css` (scoped hero pinned to the
  bottom), `HeroShell.module.css` (`.workspaceStatic`), `chat/MessageItem.tsx` (the `[label](destination)`
  markdown-link projection in user/steering bubbles: allowlisted http/https/mailto URLs render as
  external anchors, destinations `new URL` cannot parse render as file-open buttons through `openFile`
  resolved against the session cwd, any other absolute URL stays literal; decorated runs flow inline),
  `chat/ChatView.tsx` (passes `openFile` to `PendingSteeringBubble`), `chat/MessageItem.module.css`
  (the `.projectedText` inline projection and `.link` link styles), and `tsdown.config.ts` (bundle id →
  `dshui-client-ui-conversation`).

Effect: the sidebar lists only the current workspace's sessions, the input box stays pinned to the
bottom (no centered hero), the session menu reads "Delete Session" (the extension host deletes
the session log files under `$DSH_HOME/sessions/...` via the VS Code file API, bypassing dsh's
archive RPC), and markdown links in user messages are clickable (external URLs open in the system
browser, relative paths open the file in the current window). At runtime the **prebuilt artifacts**
at `../dshui-plugins/*/client.js` are used; this patch exists to reproduce those artifacts from
source. The patch also includes tests for the changes above (four specs under `tests/`).

## Applying (the base commit is pinned)

The patch targets this base commit (**pinned; it must not drift**):

```
99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
```

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git .dsh-src
cd .dsh-src
git fetch origin 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca && git checkout FETCH_HEAD
git apply ../patches/dshui-client-bundles.patch     # fails safely if the base commit mismatches
pnpm install                                        # requires pnpm 11.7.0, Node ^22.19 || >=24
pnpm run build:lib:host
pnpm run build:lib:client
cd ..
node scripts/copy-clients.mjs                       # copies the new bundles into dshui-plugins/
npm run compile
```

## When Upstream Drifts

A failed `git apply` means the base commit has drifted — re-apply each change per the checklist in
the main [README, section "Upgrading with dsh Releases"](../README.en.md#upgrading-with-dsh-releases)
(the changes are small; follow the comments in each file). dsh is MIT-licensed, so this patch and its
artifacts may be freely modified and redistributed as long as the upstream copyright notice is kept.
