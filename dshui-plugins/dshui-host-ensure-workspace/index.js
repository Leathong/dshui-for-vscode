/**
 * dshui host plugin: registers the boot working directory (the VS Code
 * workspace the extension spawned dsh in) as a durable dsh Workspace at
 * startup, so the web UI never needs a workspace picker. `create` is
 * idempotent (an existing registration for the canonical path is returned
 * unchanged). Retried briefly in case the workspace registry is still
 * bootstrapping.
 *
 * Also injects into the served index page:
 * - the workspace path as `window.__DSHUI_WORKSPACE__`, per connection: the
 *   `dshui_workspace` URL query wins, falling back to the boot working
 *   directory — with a shared backend every window carries its own folder in
 *   the query, so the scope is right for each window (the bundles read the
 *   global, so the scope survives client-side routing);
 * - the `CSS_OVERRIDES` style sheet (zero-rebuild visual seam);
 * - a clipboard/keyboard patch for the VS Code webview-iframe limitation
 *   (microsoft/vscode#129178, #180234): the workbench intercepts
 *   Cmd/Ctrl+C/V/X/A/Z for webview content and `navigator.clipboard` never
 *   settles there, so the page handles those shortcuts itself via
 *   `document.execCommand` and shims `navigator.clipboard.writeText` with
 *   the execCommand path;
 * - a VS Code theme intake (THEME_PATCH): the dsh theme system resolves its
 *   `system` preference via `prefers-color-scheme`, which in a webview iframe
 *   follows the OS rather than VS Code. The patch shadows `matchMedia` for
 *   that one query with a synthetic list driven by the VS Code color scheme —
 *   seeded from the `dshui_theme` URL query (the extension writes the current
 *   theme into every view URL) and updated live by { type: 'dshui:theme' }
 *   messages the extension posts on every theme change (relayed by the
 *   webview shell) — so `system` follows the VS Code theme, not the OS;
 * - a Cmd/Ctrl+N new-conversation patch: the workbench would otherwise take
 *   the chord for New Window, so the page intercepts it and clicks the
 *   sidebar New Session button instead (startSession in the scoped
 *   workspace, no picker);
 * - per-workspace localStorage scoping (STORAGE_SCOPE_PATCH): keys are
 *   namespaced by the workspace scope so each workspace remembers its own
 *   last-opened session and view state instead of sharing one origin-wide
 *   store;
 * - shared-backend coordination (filesystem IPC with the extension hosts):
 *   polls workspace-registration markers (`$DSH_HOME/dshui-workspaces/`) so
 *   non-owner windows' folders become Workspaces, and self-exits once the
 *   lifecycle registry (`$DSH_HOME/dshui-server.json`) holds no live window
 *   pids — a detached server outlives its spawning window but never lingers
 *   after the last window closes.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export const name = 'dshui-host-ensure-workspace'

/** Required services: the durable workspace entity registry and the HTTP server. */
export const inject = ['workspaceRegistry', 'webServer']

// ── 共享后端协调（见文件头注释）──
const SHARED_POLL_MS = 2000
/** 连续多少次轮询没有存活用户才自退出（吸收窗口重载的短暂空窗）。 */
const SELF_EXIT_GRACE_POLLS = 5

const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const markersDir = path.join(dshHome, 'dshui-workspaces')
const registryFile = path.join(dshHome, 'dshui-server.json')

function isAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return error !== null && error !== undefined && error.code === 'EPERM' }
}

const markerAttempts = new Map()

/** 处理工作区注册 marker：workspaceRegistry.create 成功后删除，失败有限重试。 */
function processMarkers(ctx) {
  let files
  try { files = fs.readdirSync(markersDir) } catch { return /* 目录尚不存在 */ }
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const full = path.join(markersDir, file)
    let parsed
    try { parsed = JSON.parse(fs.readFileSync(full, 'utf8')) } catch { fs.rmSync(full, { force: true }); continue }
    if (parsed === null || typeof parsed !== 'object' || typeof parsed.path !== 'string' || parsed.path === '') {
      fs.rmSync(full, { force: true })
      continue
    }
    ctx.workspaceRegistry.create(parsed.path).then(() => {
      markerAttempts.delete(file)
      fs.rmSync(full, { force: true })
      console.log(`[dshui] registered shared workspace: ${parsed.path}`)
    }).catch((error) => {
      // 保留 marker 持续重试（注册表可能还在引导）；只在首次失败时警告一次。
      const attempts = (markerAttempts.get(file) ?? 0) + 1
      if (attempts === 1) {
        console.warn(`[dshui] shared workspace registration pending for ${parsed.path}: ${String(error)}`)
      }
      markerAttempts.set(file, attempts)
    })
  }
}

let emptyPolls = 0

/** 生命周期自检：注册表里没有存活窗口 pid 时自退出（最后窗口关闭后收尾）。 */
function checkLiveness() {
  let raw
  try { raw = fs.readFileSync(registryFile, 'utf8') } catch { emptyPolls = 0; return }
  let registry
  try { registry = JSON.parse(raw) } catch { emptyPolls = 0; return }
  if (registry === null || typeof registry !== 'object' || !Array.isArray(registry.users)) { emptyPolls = 0; return }
  const live = registry.users.filter(isAlive)
  if (live.length === 0) {
    emptyPolls += 1
    if (emptyPolls >= SELF_EXIT_GRACE_POLLS) {
      console.log('[dshui] no live windows using the shared server; exiting')
      process.exit(0)
    }
  } else {
    emptyPolls = 0
  }
}

/**
 * Extra CSS applied to the dsh web UI, injected as a <style> tag with the
 * workspace scope. This is the zero-rebuild iteration seam: edit this list,
 * restart the panel (or reload the window), and the style applies — no
 * client bundle rebuild needed. Use stable data attributes for selectors:
 * the conversation root carries `data-dshui-scope="true"` and `data-phase`,
 * the scroll body carries `data-conversation-scroll`, the input card carries
 * `data-composer-card`, and user rows carry `data-time-hover-root`. CSS
 * Modules class names keep their local fragment (`[hash]_[local]`), so
 * `[class*="_bubble"]` matches the user bubble.
 *
 * IMPORTANT: the dsh theme defines its font tokens on `body` (not `:root`),
 * so token overrides must be declared on `body` too — a `:root` declaration
 * is shadowed for every element inside `body`.
 */
const CSS_OVERRIDES = `
  /* ── 字号收敛：dsh 默认基础字号 16px，比 VS Code（约 13px）大，统一缩小 ── */

  /* 输入框卡片（镜像/背景/文本三层共用 inherit，随卡片一致缩放） */
  [data-composer-card] {
    font-size: 14px !important;
    line-height: 22px !important;
  }

  /* composer 区（dock/hero 等继承默认 16px 的行）整体收敛到 14px */
  [data-composer-seat] {
    font-size: 14px !important;
  }

  /* 聊天正文：assistant markdown 走主题 token（定义在 body 上），覆盖各档 */
  body {
    /* 标题字号收敛：原 24/22/20/16px 相对 13px 正文过大，按层级等比缩小 */
    --dsw-font-markdown-h1: 700 18px/26px var(--dsw-font-family) !important;
    --dsw-font-markdown-h1-font-size: 18px !important;
    --dsw-font-markdown-h1-line-height: 26px !important;
    --dsw-font-markdown-h2: 700 16px/24px var(--dsw-font-family) !important;
    --dsw-font-markdown-h2-font-size: 16px !important;
    --dsw-font-markdown-h2-line-height: 24px !important;
    --dsw-font-markdown-h3: 700 15px/22px var(--dsw-font-family) !important;
    --dsw-font-markdown-h3-font-size: 15px !important;
    --dsw-font-markdown-h3-line-height: 22px !important;
    --dsw-font-markdown-h4: 600 14px/20px var(--dsw-font-family) !important;
    --dsw-font-markdown-h4-font-size: 14px !important;
    --dsw-font-markdown-h4-line-height: 20px !important;

    --dsw-font-markdown-base: 13px/20px var(--dsw-font-family) !important;
    --dsw-font-markdown-base-font-size: 13px !important;
    --dsw-font-markdown-base-line-height: 20px !important;
    --dsw-font-markdown-base-strong: 600 13px/20px var(--dsw-font-family) !important;
    --dsw-font-markdown-base-strong-font-size: 13px !important;
    --dsw-font-markdown-base-strong-line-height: 20px !important;
    --dsw-font-markdown-small: 12px/18px var(--dsw-font-family) !important;
    --dsw-font-markdown-small-font-size: 12px !important;
    --dsw-font-markdown-small-line-height: 18px !important;
    --dsw-font-markdown-code-block: 12px/18px var(--ds-font-family-code) !important;
    --dsw-font-markdown-code-block-font-size: 12px !important;
    --dsw-font-markdown-code-block-line-height: 18px !important;
    --dsw-font-markdown-code: 12px/18px var(--ds-font-family-code) !important;
    --dsw-font-markdown-code-font-size: 12px !important;
    --dsw-font-markdown-code-line-height: 18px !important;
  }

  /* 用户消息气泡（硬编码 16px，不在 token 体系内） */
  [data-time-hover-root] [class*="_bubble"] {
    font-size: 13px !important;
    line-height: 20px !important;
  }
`

/**
 * Injected clipboard/keyboard patch. VS Code's workbench intercepts
 * Cmd/Ctrl+C/V/X/A/Z for webview content (microsoft/vscode#129178, #180234),
 * so the page's own document must perform these actions and stop the event
 * from reaching the workbench. Runs in the capture phase to act first.
 * `document.execCommand('copy'/'paste'/'cut'/'selectAll'/'undo'/'redo')` works
 * inside a user gesture here (the same technique the Flutter devtools
 * extension uses); `navigator.clipboard.writeText` never settles in this
 * environment, so it is replaced with the execCommand path. Undo/redo follow
 * the same interception: bare Cmd/Ctrl+Z is undo, Shift+Cmd/Ctrl+Z and
 * Cmd/Ctrl+Y are redo — the workbench owns those chords for webview content
 * too, so without this the SPA's own redo handler never sees them.
 */
const CLIPBOARD_PATCH = `<script>
(function () {
  // writeText 垫片：原生 API 在 webview iframe 里挂起，直接用 execCommand 路径。
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText = function (text) {
      return new Promise(function (resolve, reject) {
        try {
          var el = document.createElement('textarea');
          el.value = String(text);
          el.setAttribute('readonly', '');
          el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
          document.body.appendChild(el);
          el.focus();
          el.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(el);
          if (ok) resolve(); else reject(new Error('execCommand copy failed'));
        } catch (error) { reject(error); }
      });
    };
  }
  // 快捷键：捕获阶段优先处理，阻止事件冒泡到 workbench。
  window.addEventListener('keydown', function (event) {
    var meta = event.metaKey || event.ctrlKey;
    if (!meta) return;
    var key = event.key.toLowerCase();
    if (key === 'c') {
      var selection = window.getSelection();
      var hasSel = selection !== null && selection.toString() !== '';
      var active = document.activeElement;
      if (!hasSel && active !== null && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
        hasSel = active.selectionStart !== active.selectionEnd;
      }
      if (!hasSel) return;
      try { document.execCommand('copy'); event.preventDefault(); event.stopPropagation(); } catch (e) {}
    } else if (key === 'v') {
      var pasted = false;
      try { pasted = document.execCommand('paste'); } catch (e) {}
      if (!pasted) {
        // 回退：clipboard.readText（可能需授权）+ insertText 插入焦点输入框。
        navigator.clipboard.readText().then(function (text) {
          if (text === null || text === '') return;
          var el = document.activeElement;
          if (el !== null && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
            try { document.execCommand('insertText', false, text); } catch (e) {}
          }
        }).catch(function () { /* 权限被拒：粘贴保持静默 */ });
      }
      event.preventDefault();
      event.stopPropagation();
    } else if (key === 'x') {
      try { document.execCommand('cut'); event.preventDefault(); event.stopPropagation(); } catch (e) {}
    } else if (key === 'a') {
      try { document.execCommand('selectAll'); event.preventDefault(); event.stopPropagation(); } catch (e) {}
    } else if (key === 'z' || key === 'y') {
      // 平台撤销/重做：bare Cmd/Ctrl+Z 撤销，Shift+Cmd/Ctrl+Z 与 Cmd/Ctrl+Y 重做。
      // workbench 也会抢占这些组合键，所以在这里用 execCommand 执行并阻止事件外传。
      var redo = event.shiftKey || key === 'y';
      try { document.execCommand(redo ? 'redo' : 'undo'); event.preventDefault(); event.stopPropagation(); } catch (e) {}
    }
  }, true);
})();
<\/script>`

/**
 * Cmd/Ctrl+N new-conversation patch. VS Code's workbench owns the chord
 * (New Window), so the page must intercept it first — same capture-phase
 * technique as the clipboard patch — and click the sidebar's New Session
 * button (aria-label `新建会话`, rendered in both sidebar states) to run the
 * SPA's own `startSession` flow, which creates the session in the scoped
 * workspace without a picker. Bare Cmd/Ctrl+N is always swallowed here (no
 * accidental New Window while the dsh view is focused); held-key repeats are
 * ignored so one press cannot open several sessions. While the SPA is still
 * booting there is no button yet, so the key is a no-op.
 */
const NEW_SESSION_PATCH = `<script>
(function () {
  window.addEventListener('keydown', function (event) {
    var meta = event.metaKey || event.ctrlKey;
    if (!meta) return;
    var key = event.key.toLowerCase();
    if (key !== 'n' || event.shiftKey || event.altKey || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    var button = document.querySelector('button[aria-label="新建会话"]');
    if (button !== null) button.click();
  }, true);
})();
<\/script>`

/**
 * Composer reference intake. The extension's context-menu commands
 * (dshui.referenceFile / dshui.referenceSelection) post a
 * { type: 'dshui:reference', text } message to the webview shell, which
 * relays it into this iframe. The composer draft is React-controlled (the
 * input machine owns it), so the text is written with the native textarea
 * value setter followed by an 'input' event — the same path as user typing —
 * which updates the machine draft and its backdrop mirror. The composer can
 * be absent (SPA still booting) or read-only (busy/submitting), so inbound
 * texts queue and drain once a writable composer exists (capped, so a
 * permanently unusable composer cannot spin forever). The ready handshake
 * tells the shell this listener is live, so references posted while the page
 * loaded are flushed instead of dropped.
 */
const REFERENCE_PATCH = `<script>
(function () {
  var pending = [];
  var retries = 0;
  function insertInto(textarea, text) {
    var draft = textarea.value;
    var sep = draft !== '' && !draft.endsWith('\\n') ? '\\n' : '';
    var next = draft + sep + text;
    var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, next);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    try {
      textarea.focus();
      var end = next.length;
      textarea.setSelectionRange(end, end);
    } catch (error) { /* focus/selection are best-effort */ }
  }
  function drain() {
    if (pending.length === 0) return;
    var card = document.querySelector('[data-composer-card]');
    var textarea = card === null ? null : card.querySelector('textarea');
    if (textarea !== null && !textarea.disabled && !textarea.readOnly) {
      pending.forEach(function (text) { insertInto(textarea, text); });
      pending = [];
      retries = 0;
      return;
    }
    retries += 1;
    if (retries > 100) { pending = []; retries = 0; return; }
    setTimeout(drain, 100);
  }
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (data === null || typeof data !== 'object' || data.type !== 'dshui:reference') return;
    if (typeof data.text !== 'string' || data.text === '') return;
    pending.push(data.text);
    drain();
  });
  window.parent.postMessage({ type: 'dshui:ready' }, '*');
})();
<\/script>`

/**
 * VS Code theme intake (see the file header). The dsh theme system resolves
 * its `system` preference through `prefers-color-scheme`, which in a webview
 * iframe follows the OS instead of VS Code. This script shadows `matchMedia`
 * for exactly that query with a synthetic list driven by the VS Code color
 * scheme, so the SPA keeps working unchanged — boot-theme and ui-theme's
 * ThemeRuntime both read through the shadow, and the synthetic list fires
 * `change` when VS Code's theme flips while the preference is `system`.
 * The scheme comes from the `dshui_theme` URL query at boot (the extension
 * writes the current theme into every view URL) and from
 * { type: 'dshui:theme', colorScheme } messages afterwards (relayed by the
 * webview shell; re-sent on SPA readiness). Any other matchMedia query, or a
 * page without both the query and the messages (e.g. opened in a browser via
 * dshui.openInBrowser), falls back to the real implementation — the OS scheme.
 */
const THEME_PATCH = `<script>
(function () {
  var QUERY = '(prefers-color-scheme: dark)';
  var realMatchMedia = typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null;
  var scheme = (new URLSearchParams(window.location.search).get('dshui_theme')) || null;
  if (scheme !== 'dark' && scheme !== 'light') scheme = null;
  var listeners = [];
  var lastMatches = null;

  function dark() {
    if (scheme !== null) return scheme === 'dark';
    return realMatchMedia === null ? false : realMatchMedia(QUERY).matches;
  }

  function fire() {
    var matches = dark();
    if (matches === lastMatches) return;
    lastMatches = matches;
    var event = { matches: matches, media: QUERY };
    for (var i = 0; i < listeners.length; i += 1) {
      try { listeners[i](event); } catch (error) { /* 单个监听器出错不阻断主题中继 */ }
    }
  }

  window.matchMedia = function (query) {
    if (query !== QUERY) {
      return realMatchMedia === null
        ? { matches: false, media: query, onchange: null, addEventListener: function () {}, removeEventListener: function () {}, addListener: function () {}, removeListener: function () {}, dispatchEvent: function () { return true; } }
        : realMatchMedia(query);
    }
    return {
      media: QUERY,
      get matches() { return dark(); },
      onchange: null,
      addEventListener: function (type, fn) {
        if (type !== 'change' || typeof fn !== 'function') return;
        if (listeners.indexOf(fn) === -1) listeners.push(fn);
      },
      removeEventListener: function (type, fn) {
        if (type !== 'change') return;
        var at = listeners.indexOf(fn);
        if (at !== -1) listeners.splice(at, 1);
      },
      addListener: function (fn) { this.addEventListener('change', fn); },
      removeListener: function (fn) { this.removeEventListener('change', fn); },
      dispatchEvent: function () { return true; }
    };
  };

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (data === null || typeof data !== 'object' || data.type !== 'dshui:theme') return;
    if (data.colorScheme !== 'dark' && data.colorScheme !== 'light') return;
    if (scheme === data.colorScheme) return;
    scheme = data.colorScheme;
    fire();
  });
})();
<\/script>`

/**
 * External-link opener. The SPA renders http(s) markdown links as
 * `<a target="_blank">`, which in a normal browser opens a new tab — but the
 * VS Code webview blocks `window.open`/popups, so such clicks do nothing
 * here. This script intercepts clicks on those anchors in the capture phase
 * and posts the URL to the webview shell, which forwards it to the extension
 * host to open via `vscode.env.openExternal` (the system browser). Modifier
 * clicks are left alone (VS Code handles Cmd/Ctrl+click itself), and only
 * http/https/mailto destinations are routed; everything else keeps its
 * default behavior.
 */
const EXTERNAL_LINK_PATCH = `<script>
(function () {
  window.addEventListener('click', function (event) {
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var anchor = null;
    var node = event.target;
    while (node !== null && node !== document) {
      if (node.tagName === 'A') { anchor = node; break; }
      node = node.parentNode;
    }
    if (anchor === null) return;
    var href = anchor.getAttribute('href');
    if (href === null || href === '') return;
    var url;
    try { url = new URL(href, window.location.href); } catch (error) { return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') return;
    event.preventDefault();
    event.stopPropagation();
    window.parent.postMessage({ type: 'dshui:openExternal', url: url.href }, '*');
  }, true);
})();
<\/script>`

/**
 * Per-workspace localStorage scoping. Every dsh window shares one origin
 * (`http://127.0.0.1:<port>`), so browser-side persistence — the last opened
 * session (`dsh.sessions.current`), the workspace-browser view, composer
 * drafts, locale, … — is shared across workspaces by default: a session
 * opened in window A would resurface in window B's different folder. This
 * script namespaces every localStorage key with a short hash of the
 * workspace scope, so each workspace remembers its own state across
 * launches. The scope comes from `window.__DSHUI_WORKSPACE__` (set by the
 * adjacent injected script); a page without a workspace scope (a plain
 * browser hit on the server root) keeps stock unscoped behavior. Only
 * localStorage is wrapped — the SPA's persistence reads and writes through
 * it exclusively.
 */
const STORAGE_SCOPE_PATCH = `<script>
(function () {
  var scope = '';
  try {
    var g = window.__DSHUI_WORKSPACE__;
    if (typeof g === 'string' && g !== '') scope = g;
  } catch (error) { /* scope-less page: keep stock behavior */ }
  if (scope === '') return;
  var hash = 0;
  for (var i = 0; i < scope.length; i += 1) {
    hash = ((hash << 5) - hash + scope.charCodeAt(i)) | 0;
  }
  var prefix = 'dshui:' + (hash >>> 0).toString(36) + ':';
  try {
    var real = window.localStorage;
    if (real === null || real === undefined || real.__dshuiScopePrefix === prefix) return;
    var wrapper = {
      __dshuiScopePrefix: prefix,
      getItem: function (key) { return real.getItem(prefix + key); },
      setItem: function (key, value) { return real.setItem(prefix + key, value); },
      removeItem: function (key) { return real.removeItem(prefix + key); },
      key: function (index) {
        var count = 0;
        for (var i = 0; i < real.length; i += 1) {
          var k = real.key(i);
          if (k === null || k.indexOf(prefix) !== 0) continue;
          if (count === index) return k.slice(prefix.length);
          count += 1;
        }
        return null;
      },
      get length() {
        var count = 0;
        for (var i = 0; i < real.length; i += 1) {
          var k = real.key(i);
          if (k !== null && k.indexOf(prefix) === 0) count += 1;
        }
        return count;
      },
      clear: function () {
        for (var i = real.length - 1; i >= 0; i -= 1) {
          var k = real.key(i);
          if (k !== null && k.indexOf(prefix) === 0) real.removeItem(k);
        }
      }
    };
    Object.defineProperty(window, 'localStorage', { value: wrapper, configurable: true, writable: true });
  } catch (error) { /* scoping must never break the page */ }
})();
<\/script>`

export function apply(ctx) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const ensure = async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await ctx.workspaceRegistry.create(process.cwd())
        return
      } catch (error) {
        if (attempt === 59) {
          console.warn('[dshui] failed to ensure workspace at boot:', error)
          return
        }
        await delay(250)
      }
    }
  }
  void ensure()

  const scopeJson = JSON.stringify(process.cwd()).replaceAll('<', '\\u003c')
  const style = CSS_OVERRIDES.trim() === '' ? '' : `<style>${CSS_OVERRIDES}</style>`
  ctx.effect(
    () => ctx.webServer.tapIndex((html) => {
      // 作用域按连接解析：URL 查询参数优先（每个窗口自己的 folder），
      // 无查询时退回启动工作目录。
      const injected = `${style}${CLIPBOARD_PATCH}${NEW_SESSION_PATCH}${THEME_PATCH}${EXTERNAL_LINK_PATCH}${REFERENCE_PATCH}<script>window.__DSHUI_WORKSPACE__ = (new URLSearchParams(window.location.search).get('dshui_workspace')) || ${scopeJson}<\/script>${STORAGE_SCOPE_PATCH}`
      const head = html.indexOf('<head>')
      return head === -1 ? `${injected}${html}` : `${html.slice(0, head + 6)}${injected}${html.slice(head + 6)}`
    }),
    'dshui: workspace scope + css + clipboard + theme + external links + reference intake index injection',
  )

  // 共享后端轮询：处理工作区注册 marker + 生命周期自检。
  ctx.effect(
    () => {
      const timer = setInterval(() => {
        processMarkers(ctx)
        checkLiveness()
      }, SHARED_POLL_MS)
      processMarkers(ctx)
      checkLiveness()
      return () => { clearInterval(timer) }
    },
    'dshui: shared-backend workspace markers + lifecycle self-check',
  )
}
