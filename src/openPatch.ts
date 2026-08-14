/**
 * Routes the dsh web UI's "open path" gestures into the hosting VS Code.
 *
 * The dsh api-proxy opens paths with the OS default handler (`open <path>`
 * on macOS) — a browser app has no idea an IDE is hosting it. This module
 * applies a small, idempotent source patch to the bundled
 * `@deepseek-ai/dsh-host-apiproxy` lib so the darwin branch first asks the
 * extension's local open bridge (`DSHUI_OPEN_ENDPOINT`, a 127.0.0.1 HTTP
 * endpoint) to open the path through the VS Code API — no OS scheme
 * confirmation popup — and falls back to `open vscode://file/<path>`
 * (browser documents such as .html/.pdf still go to the browser via the
 * existing BROWSER_DOCUMENTS fast path).
 */
import * as fs from 'node:fs'

/** The stock darwin branch inside `openNativePathWithIntent`. */
const STOCK_DARWIN_BRANCH = `	if (platform === "darwin") {
		await run("open", intent === "text-editor" ? ["-t", path] : [path], signal);
		return;
	}`

/** First patch form (text-editor intent only) — superseded. */
const OLD1_DARWIN_BRANCH = `	if (platform === "darwin") {
		await run("open", [intent === "text-editor" ? dshuiVscodeFileUrl(path) : path], signal);
		return;
	}`

/** Second patch form (plain vscode://file) — superseded. */
const OLD2_DARWIN_BRANCH = `	if (platform === "darwin") {
		await run("open", [dshuiVscodeFileUrl(path)], signal);
		return;
	}`

/** Current form: extension open bridge first, vscode://file fallback. */
const PATCHED_DARWIN_BRANCH = `	if (platform === "darwin") {
		if (await dshuiOpenViaBridge(path, signal)) return;
		await run("open", [dshuiVscodeFileUrl(path)], signal);
		return;
	}`

/** Helper inserted before `openNativePathWithIntent`. */
const HELPER = `/**
 * dshui patch: ask the hosting VS Code (via the extension's local open
 * bridge) to open a path, avoiding the OS external-scheme confirmation
 * popup. Falls back to false so the caller can try the vscode://file URL.
 * @param path - absolute filesystem path (POSIX separators).
 * @param signal - caller/connection lifetime (aborts the bridge request).
 * @returns true when the bridge accepted the open.
 */
async function dshuiOpenViaBridge(path, signal) {
	const endpoint = process.env.DSHUI_OPEN_ENDPOINT;
	if (!endpoint) return false;
	try {
		const response = await fetch(endpoint + "?path=" + encodeURIComponent(path), { signal });
		return response.ok;
	} catch (error) {
		console.warn("[dshui] open bridge failed, falling back to vscode://file:", error);
		return false;
	}
}
/**
 * dshui patch: absolute path as a \`vscode://file/\` URL (fallback opener).
 * @param path - absolute filesystem path (POSIX separators).
 * @returns the vscode URL for the path.
 */
function dshuiVscodeFileUrl(path) {
	return "vscode://file/" + path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}
`

/**
 * Apply the patch to the api-proxy lib file (idempotent; upgrades any earlier
 * patch form in place).
 * @param apiProxyLibPath - absolute path of the bundled
 *   `dsh-host-apiproxy/lib/index.js`.
 * @returns whether the file is patched (or was already patched).
 */
export function patchFileOpener(apiProxyLibPath: string): { patched: boolean; note?: string } {
  if (apiProxyLibPath === '' || !fs.existsSync(apiProxyLibPath)) {
    return { patched: false, note: 'api-proxy lib not found; native opener left unchanged' }
  }
  let source: string
  try {
    source = fs.readFileSync(apiProxyLibPath, 'utf8')
  } catch (error) {
    return { patched: false, note: `api-proxy lib unreadable (${String(error)}); native opener left unchanged` }
  }
  try {
    if (source.includes(PATCHED_DARWIN_BRANCH)) return { patched: true, note: 'already patched' }
    let next = source
    if (source.includes(OLD2_DARWIN_BRANCH)) {
      next = source.replace(OLD2_DARWIN_BRANCH, PATCHED_DARWIN_BRANCH)
    } else if (source.includes(OLD1_DARWIN_BRANCH)) {
      next = source.replace(OLD1_DARWIN_BRANCH, PATCHED_DARWIN_BRANCH)
    } else if (source.includes(STOCK_DARWIN_BRANCH)) {
      next = source.replace(STOCK_DARWIN_BRANCH, PATCHED_DARWIN_BRANCH)
    } else {
      return { patched: false, note: 'darwin branch not found; skipping (dsh version drift?)' }
    }
    if (!next.includes('function dshuiOpenViaBridge')) {
      next = next.replace(
        'async function openNativePathWithIntent(path, signal, intent, internals = {}) {',
        `${HELPER}async function openNativePathWithIntent(path, signal, intent, internals = {}) {`,
      )
    }
    fs.writeFileSync(apiProxyLibPath, next)
    return { patched: true, note: 'patched' }
  } catch (error) {
    return { patched: false, note: `patch write failed (${String(error)}); native opener left unchanged` }
  }
}
