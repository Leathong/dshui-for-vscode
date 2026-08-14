/**
 * dshui host plugin: registers the boot working directory (the VS Code
 * workspace the extension spawned dsh in) as a durable dsh Workspace at
 * startup, so the web UI never needs a workspace picker. `create` is
 * idempotent (an existing registration for the canonical path is returned
 * unchanged). Retried briefly in case the workspace registry is still
 * bootstrapping.
 *
 * Also injects into the served index page:
 * - the workspace path as `window.__DSHUI_WORKSPACE__` (the browser bundles
 *   read that global, falling back to the `dshui_workspace` URL query
 *   parameter, so the scope survives any client-side routing);
 * - the `CSS_OVERRIDES` style sheet (zero-rebuild visual seam);
 * - a clipboard/keyboard patch for the VS Code webview-iframe limitation
 *   (microsoft/vscode#129178, #180234): the workbench intercepts
 *   Cmd/Ctrl+C/V/X/A/Z for webview content and `navigator.clipboard` never
 *   settles there, so the page handles those shortcuts itself via
 *   `document.execCommand` and shims `navigator.clipboard.writeText` with
 *   the execCommand path.
 */
export const name = 'dshui-host-ensure-workspace'

/** Required services: the durable workspace entity registry and the HTTP server. */
export const inject = ['workspaceRegistry', 'webServer']

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
 * `document.execCommand('copy'/'paste'/'cut'/'selectAll'/'undo')` works
 * inside a user gesture here (the same technique the Flutter devtools
 * extension uses); `navigator.clipboard.writeText` never settles in this
 * environment, so it is replaced with the execCommand path.
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
    } else if (key === 'z' && !event.shiftKey) {
      try { document.execCommand('undo'); event.preventDefault(); event.stopPropagation(); } catch (e) {}
    }
  }, true);
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
      const injected = `${style}${CLIPBOARD_PATCH}<script>window.__DSHUI_WORKSPACE__ = ${scopeJson}<\/script>`
      const head = html.indexOf('<head>')
      return head === -1 ? `${injected}${html}` : `${html.slice(0, head + 6)}${injected}${html.slice(head + 6)}`
    }),
    'dshui: workspace scope + css + clipboard patch index injection',
  )
}
