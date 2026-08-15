/**
 * Routes the dsh web UI's "open path" gestures into the hosting VS Code.
 *
 * The dsh api-proxy opens paths with the OS default handler (`open <path>`
 * on macOS) — a browser app has no idea an IDE is hosting it. This module
 * applies a small, idempotent source patch to the bundled
 * `@deepseek-ai/dsh-host-apiproxy` lib so the darwin branch first asks the
 * hosting VS Code to open the path through a local open bridge — no OS
 * scheme confirmation popup. With a shared backend every window registers its
 * bridge (`DSHUI_BRIDGES_FILE`), and the window whose workspace is the
 * longest path prefix of the opened file handles the open, so a file clicked
 * in window B opens in B; the owner's bridge (`DSHUI_OPEN_ENDPOINT`) is the
 * fallback. Then comes the `code` CLI (`DSHUI_CODE_CLI`, resolved by the
 * extension from its own app bundle, since a Finder-launched host has a
 * minimal PATH), whose socket protocol also opens in the running VS Code
 * without the confirmation popup, and only then
 * `open vscode://file/<path>` (browser documents such as .html/.pdf still go
 * to the browser via the existing BROWSER_DOCUMENTS fast path).
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

/** Third patch form (bridge, then vscode://file) — superseded. */
const OLD3_DARWIN_BRANCH = `	if (platform === "darwin") {
		if (await dshuiOpenViaBridge(path, signal)) return;
		await run("open", [dshuiVscodeFileUrl(path)], signal);
		return;
	}`

/** Current form: extension open bridge, then code CLI, then vscode://file. */
const PATCHED_DARWIN_BRANCH = `	if (platform === "darwin") {
		if (await dshuiOpenViaBridge(path, signal)) return;
		if (await dshuiOpenViaCli(path, signal)) return;
		await run("open", [dshuiVscodeFileUrl(path)], signal);
		return;
	}`

/** Old bridge helper (owner endpoint only) — superseded, replaced in place. */
const OLD_BRIDGE_HELPER = `async function dshuiOpenViaBridge(path, signal) {
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
`

/**
 * Bridge helpers: workspace-aware bridge selection, inserted before
 * `openNativePathWithIntent`. The window whose registered workspace is the
 * longest path prefix of the opened file handles the open, so a file clicked
 * in window B opens in B — the owner bridge is only the fallback.
 */
const BRIDGE_FUNCTIONS = `/**
 * dshui patch: ask the hosting VS Code (via a window's local open bridge) to
 * open a path, avoiding the OS external-scheme confirmation popup. The bridge
 * is chosen by workspace: the registration whose workspace is the longest path
 * prefix of the opened file (DSHUI_BRIDGES_FILE, written by every window's
 * extension), falling back to the owner's bridge (DSHUI_OPEN_ENDPOINT).
 * Returns false so the caller can try the code CLI.
 * @param path - absolute filesystem path (POSIX separators).
 * @param signal - caller/connection lifetime (aborts the bridge request).
 * @returns true when a bridge accepted the open.
 */
async function dshuiOpenViaBridge(path, signal) {
	const target = await dshuiPickBridgeForPath(path);
	if (target !== null && await dshuiBridgeRequest(target, path, signal)) return true;
	const endpoint = process.env.DSHUI_OPEN_ENDPOINT;
	if (endpoint !== undefined && await dshuiBridgeRequest(endpoint, path, signal)) return true;
	return false;
}
/**
 * dshui patch: POST one open request to a bridge endpoint.
 * @param endpoint - bridge base URL.
 * @param path - absolute filesystem path.
 * @param signal - caller/connection lifetime.
 * @returns true when the bridge answered ok.
 */
async function dshuiBridgeRequest(endpoint, path, signal) {
	try {
		const response = await fetch(endpoint + "?path=" + encodeURIComponent(path), { signal });
		return response.ok;
	} catch (error) {
		console.warn("[dshui] open bridge request failed:", error);
		return false;
	}
}
/**
 * dshui patch: pick the bridge endpoint whose registered workspace is the
 * longest path prefix of the opened file; null when none matches. Entries of
 * dead windows are skipped.
 * @param path - absolute filesystem path.
 * @returns the bridge endpoint, or null.
 */
async function dshuiPickBridgeForPath(path) {
	const bridgesFile = process.env.DSHUI_BRIDGES_FILE;
	if (!bridgesFile) return null;
	let fsModule, raw;
	try {
		fsModule = await import("node:fs");
		raw = fsModule.readFileSync(bridgesFile, "utf8");
	} catch (error) {
		return null;
	}
	let bridges;
	try { bridges = JSON.parse(raw); } catch (error) { return null; }
	if (bridges === null || typeof bridges !== "object") return null;
	let best = null;
	for (const key of Object.keys(bridges)) {
		const entry = bridges[key];
		if (entry === null || typeof entry !== "object"
			|| typeof entry.pid !== "number" || !dshuiPidAlive(entry.pid)
			|| typeof entry.workspace !== "string" || entry.workspace === ""
			|| typeof entry.endpoint !== "string" || entry.endpoint === "") continue;
		if (path === entry.workspace || path.startsWith(entry.workspace + "/")) {
			if (best === null || entry.workspace.length > best.workspace.length) best = entry;
		}
	}
	return best === null ? null : best.endpoint;
}
/**
 * dshui patch: process liveness via signal 0.
 * @param pid - process id.
 * @returns true when the pid is alive.
 */
function dshuiPidAlive(pid) {
	try { process.kill(pid, 0); return true; } catch (error) { return error !== null && error !== undefined && error.code === "EPERM"; }
}
`

/** Absolute path as a \`vscode://file/\` URL (last-resort fallback opener). */
const URL_FUNCTION = `/**
 * dshui patch: absolute path as a \`vscode://file/\` URL (fallback opener).
 * @param path - absolute filesystem path (POSIX separators).
 * @returns the vscode URL for the path.
 */
function dshuiVscodeFileUrl(path) {
	return "vscode://file/" + path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}
`

/** Full helper set for a never-patched (stock) api-proxy lib. */
const HELPER = `${BRIDGE_FUNCTIONS}${URL_FUNCTION}`
/**
 * dshui patch: fall back to the \`code\` CLI — its socket protocol opens the
 * path in the running VS Code without the OS external-scheme confirmation
 * popup. The CLI path is \`DSHUI_CODE_CLI\` (the hosting extension resolves it
 * from its own app bundle, because a Finder-launched extension host has a
 * minimal PATH); defaults to \`code\` on PATH. Returns false so the caller can
 * try the vscode://file URL.
 * @param path - absolute filesystem path (POSIX separators).
 * @param signal - caller/connection lifetime (aborts the CLI spawn).
 * @returns true when the CLI spawned without error.
 */
const CLI_HELPER = `async function dshuiOpenViaCli(path, signal) {
	const cli = process.env.DSHUI_CODE_CLI || "code";
	try {
		await runNativeCommand(cli, [path], signal);
		return true;
	} catch (error) {
		console.warn("[dshui] code CLI open failed, falling back to vscode://file:", error);
		return false;
	}
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
    if (source.includes(PATCHED_DARWIN_BRANCH) && source.includes('function dshuiPickBridgeForPath')) {
      return { patched: true, note: 'already patched' }
    }
    let next = source
    if (!source.includes(PATCHED_DARWIN_BRANCH)) {
      if (source.includes(OLD3_DARWIN_BRANCH)) {
        next = source.replace(OLD3_DARWIN_BRANCH, PATCHED_DARWIN_BRANCH)
      } else if (source.includes(OLD2_DARWIN_BRANCH)) {
        next = source.replace(OLD2_DARWIN_BRANCH, PATCHED_DARWIN_BRANCH)
      } else if (source.includes(OLD1_DARWIN_BRANCH)) {
        next = source.replace(OLD1_DARWIN_BRANCH, PATCHED_DARWIN_BRANCH)
      } else if (source.includes(STOCK_DARWIN_BRANCH)) {
        next = source.replace(STOCK_DARWIN_BRANCH, PATCHED_DARWIN_BRANCH)
      } else {
        return { patched: false, note: 'darwin branch not found; skipping (dsh version drift?)' }
      }
    }
    // Bridge helpers: upgrade in place, never duplicate.
    if (next.includes('function dshuiPickBridgeForPath')) {
      // 新 helper 已就位。
    } else if (source.includes(OLD_BRIDGE_HELPER)) {
      next = next.replace(OLD_BRIDGE_HELPER, BRIDGE_FUNCTIONS)
    } else if (!next.includes('function dshuiOpenViaBridge')) {
      next = next.replace(
        'async function openNativePathWithIntent(path, signal, intent, internals = {}) {',
        `${next.includes('function dshuiVscodeFileUrl') ? BRIDGE_FUNCTIONS : HELPER}async function openNativePathWithIntent(path, signal, intent, internals = {}) {`,
      )
    } else {
      return { patched: false, note: 'unrecognized bridge helper; leaving file unchanged' }
    }
    if (!next.includes('function dshuiOpenViaCli')) {
      next = next.replace(
        'async function openNativePathWithIntent(path, signal, intent, internals = {}) {',
        `${CLI_HELPER}async function openNativePathWithIntent(path, signal, intent, internals = {}) {`,
      )
    }
    fs.writeFileSync(apiProxyLibPath, next)
    return { patched: true, note: 'patched' }
  } catch (error) {
    return { patched: false, note: `patch write failed (${String(error)}); native opener left unchanged` }
  }
}
