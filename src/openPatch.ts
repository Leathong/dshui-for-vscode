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
 *
 * Note on logging: the `console.warn` calls inside the injected strings below
 * run in the **dsh server process** (the patched api-proxy), not in the
 * extension host, so they intentionally stay `console.*` — the server's
 * stdout/stderr is piped into the extension and forwarded to the "dsh UI"
 * Output channel (see `DshServer.onOutput`), so those warnings show up there
 * with a `[dshui:server]` prefix.
 *
 * Nested workspaces: a path under a child workspace matches BOTH the outer
 * and the child registration, and longest-prefix routing would always pick
 * the child window even when the click happened in the outer window. The
 * dshui client bundle attaches the click origin (the session's project
 * directory) to the `host.openPath` payload as `dshuiOrigin`; this patch
 * threads it through to the darwin branch, and the bridge selection prefers
 * the origin's own window whenever the origin workspace contains the opened
 * path. Only when the path lies outside the origin workspace does the
 * longest-prefix registry lookup decide (a file clicked in window A that
 * belongs to window B still opens in B).
 */
import * as fs from 'node:fs'
import { SERVER_USER_LEASE_TTL_MS } from './sharedBackend'

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

/** Fourth patch form (bridge, code CLI, then vscode://file) — superseded. */
const OLD4_DARWIN_BRANCH = `	if (platform === "darwin") {
		if (await dshuiOpenViaBridge(path, signal)) return;
		if (await dshuiOpenViaCli(path, signal)) return;
		await run("open", [dshuiVscodeFileUrl(path)], signal);
		return;
	}`

/** Current form: origin-aware bridge selection, then code CLI, then vscode://file. */
const PATCHED_DARWIN_BRANCH = `	if (platform === "darwin") {
		if (await dshuiOpenViaBridge(path, signal, internals.dshuiOrigin)) return;
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
 * Bridge helpers: origin-aware bridge selection, inserted before
 * `openNativePathWithIntent`. The click origin (`dshuiOrigin`, attached by
 * the dshui client bundle and threaded through `internals`) wins when it
 * contains the opened path — nested workspaces make a path match several
 * windows, and only the origin is unambiguous. Otherwise the window whose
 * registered workspace is the longest path prefix of the opened file handles
 * the open, so a file clicked in window B opens in B — the owner bridge is
 * only the fallback.
 */
const BRIDGE_FUNCTIONS = `/**
 * dshui patch: ask the hosting VS Code (via a window's local open bridge) to
 * open a path, avoiding the OS external-scheme confirmation popup. The click
 * origin wins when its workspace contains the path (nested workspaces make a
 * path match several windows; only the origin is unambiguous); otherwise the
 * bridge is chosen by workspace: the registration whose workspace is the
 * longest path prefix of the opened file (DSHUI_BRIDGES_FILE, written by
 * every window's extension), falling back to the owner's bridge
 * (DSHUI_OPEN_ENDPOINT). Returns false so the caller can try the code CLI.
 * @param path - absolute filesystem path (POSIX separators).
 * @param signal - caller/connection lifetime (aborts the bridge request).
 * @param origin - workspace of the window the click happened in, when the
 *   client attached it to the open request (see dshuiOpenOriginInternals).
 * @returns true when a bridge accepted the open.
 */
async function dshuiOpenViaBridge(path, signal, origin) {
	const originWs = dshuiOriginWorkspace(origin);
	if (originWs !== null && (path === originWs || path.startsWith(originWs + "/"))) {
		// Origin preference: the click happened in a window whose workspace
		// contains this path, so open it there. The origin's own bridge is
		// looked up by exact workspace match (a shared backend serves several
		// windows, so the origin need not be the owner); the owner bridge is
		// the fallback when that window's bridge is unreachable.
		const own = await dshuiBridgeForWorkspace(originWs);
		if (own !== null && await dshuiBridgeRequest(own, path, signal)) return true;
		const endpoint = process.env.DSHUI_OPEN_ENDPOINT;
		const token = process.env.DSHUI_OPEN_TOKEN;
		if (endpoint !== undefined && await dshuiBridgeRequest({ endpoint, token }, path, signal)) return true;
		return false;
	}
	const target = await dshuiPickBridgeForPath(path);
	if (target !== null && await dshuiBridgeRequest(target, path, signal)) return true;
	const endpoint = process.env.DSHUI_OPEN_ENDPOINT;
	const token = process.env.DSHUI_OPEN_TOKEN;
	if (endpoint !== undefined && await dshuiBridgeRequest({ endpoint, token }, path, signal)) return true;
	return false;
}
/**
 * dshui patch: normalize the click origin attached by the client bundle.
 * The origin only ever arrives in the request payload — the server process
 * cwd is the owner's workspace under a shared backend, never the clicking
 * window's, so a cwd fallback would misroute clicks from attached windows.
 * @param origin - raw origin from the open request payload.
 * @returns the normalized workspace path, or null.
 */
function dshuiOriginWorkspace(origin) {
	if (typeof origin !== "string" || origin === "") return null;
	let workspace = origin;
	while (workspace.length > 1 && (workspace.endsWith("/") || workspace.endsWith("\\\\"))) workspace = workspace.slice(0, -1);
	return workspace === "" ? null : workspace;
}
/**
 * dshui patch: the bridge registered by the window with the exact workspace
 * path; null when none (or its registration is dead/expired).
 * @param workspace - canonical workspace path.
 * @returns the bridge selection, or null.
 */
async function dshuiBridgeForWorkspace(workspace) {
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
	for (const key of Object.keys(bridges)) {
		const entry = bridges[key];
		if (entry === null || typeof entry !== "object"
			|| typeof entry.pid !== "number" || !dshuiPidAlive(entry.pid)
			|| typeof entry.id !== "string" || entry.id === ""
			|| typeof entry.lastSeen !== "number" || !dshuiBridgeLeaseLive(entry)
			|| typeof entry.workspace !== "string" || entry.workspace === ""
			|| typeof entry.endpoint !== "string" || entry.endpoint === ""
			|| typeof entry.token !== "string" || entry.token === "") continue;
		if (entry.workspace === workspace) return { endpoint: entry.endpoint, token: entry.token };
	}
	return null;
}
/**
 * dshui patch: GET one open request to a bridge endpoint.
 * @param target - bridge selection with endpoint URL and optional token.
 * @param path - absolute filesystem path.
 * @param signal - caller/connection lifetime.
 * @returns true when the bridge answered ok.
 */
async function dshuiBridgeRequest(target, path, signal) {
	if (!target || typeof target.endpoint !== "string" || target.endpoint === "") return false;
	try {
		let url = target.endpoint + "?path=" + encodeURIComponent(path);
		if (typeof target.token === "string" && target.token !== "") url += "&token=" + encodeURIComponent(target.token);
		const response = await fetch(url, { signal });
		return response.ok;
	} catch (error) {
		console.warn("[dshui] open bridge request failed:", error);
		return false;
	}
}
/**
 * dshui patch: pick the bridge whose registered workspace is the longest path
 * prefix of the opened file; null when none matches. Dead or expired windows
 * are skipped.
 * @param path - absolute filesystem path.
 * @returns the bridge selection, or null.
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
			|| typeof entry.id !== "string" || entry.id === ""
			|| typeof entry.lastSeen !== "number" || !dshuiBridgeLeaseLive(entry)
			|| typeof entry.workspace !== "string" || entry.workspace === ""
			|| typeof entry.endpoint !== "string" || entry.endpoint === ""
			|| typeof entry.token !== "string" || entry.token === "") continue;
		if (path === entry.workspace || path.startsWith(entry.workspace + "/")) {
			if (best === null || entry.workspace.length > best.workspace.length) best = entry;
		}
	}
	return best === null ? null : { endpoint: best.endpoint, token: best.token };
}
/**
 * dshui patch: the click-origin internals seam for the native open call. The
 * client bundle attaches the origin (the session's project directory) to the
 * host.openPath payload; the api-proxy callers pass it down so the darwin
 * branch can route by origin. An absent origin yields empty internals, which
 * keeps every non-client caller (settings documents, tests) unchanged.
 * @param request - the unary request being handled.
 * @returns internals carrying the origin, or empty.
 */
function dshuiOpenOriginInternals(request) {
	const origin = request === null || request === void 0 ? void 0 : request.payload?.dshuiOrigin;
	if (typeof origin === "string" && origin !== "") return { dshuiOrigin: origin };
	return {};
}
/**
 * dshui patch: bridge lease liveness. A pid alone is insufficient because the
 * OS can recycle it after the owning window dies; the lease must also be fresh.
 * @param entry - bridge registration entry.
 * @returns true when the entry is still valid.
 */
function dshuiBridgeLeaseLive(entry) {
	return Date.now() - entry.lastSeen <= ${SERVER_USER_LEASE_TTL_MS};
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

/** Present in the current bridge-helper block; used to upgrade older patches. */
const BRIDGE_LEASE_PATCH_MARKER = 'function dshuiBridgeLeaseLive'
const BRIDGE_TOKEN_PATCH_MARKER = 'typeof target.token'
const BRIDGE_ORIGIN_MARKER = 'dshuiBridgeForWorkspace'

/** The extended host.openPath request schema keeping the click origin. */
const OPEN_PATH_SCHEMA = 'const hostOpenPathRequestSchema = z$1.object({ path: z$1.string().min(1) });'
const OPEN_PATH_SCHEMA_ORIGIN = 'const hostOpenPathRequestSchema = z$1.object({ path: z$1.string().min(1), dshuiOrigin: z$1.string().optional() });'

/** The api-proxy openPath/openTextFile callers, threaded with the origin seam. */
const OPEN_PATH_CALLER = '(target, openSignal) => openNativePath(target, openSignal)'
const OPEN_PATH_CALLER_ORIGIN = '(target, openSignal) => openNativePath(target, openSignal, dshuiOpenOriginInternals(request))'
const OPEN_TEXT_CALLER = '(target, openSignal) => openNativeTextFile(target, openSignal)'
const OPEN_TEXT_CALLER_ORIGIN = '(target, openSignal) => openNativeTextFile(target, openSignal, dshuiOpenOriginInternals(request))'

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
    const hasCurrentDarwinBranch = source.includes(PATCHED_DARWIN_BRANCH)
    if (hasCurrentDarwinBranch
      && source.includes(BRIDGE_LEASE_PATCH_MARKER) && source.includes(BRIDGE_TOKEN_PATCH_MARKER)
      && source.includes(BRIDGE_ORIGIN_MARKER) && source.includes(OPEN_PATH_SCHEMA_ORIGIN)
      && source.includes(OPEN_PATH_CALLER_ORIGIN)) {
      return { patched: true, note: 'already patched' }
    }
    let next = source
    if (!hasCurrentDarwinBranch) {
      if (source.includes(OLD4_DARWIN_BRANCH)) {
        next = source.replace(OLD4_DARWIN_BRANCH, PATCHED_DARWIN_BRANCH)
      } else if (source.includes(OLD3_DARWIN_BRANCH)) {
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

    const openerSignature = 'async function openNativePathWithIntent(path, signal, intent, internals = {}) {'
    // Bridge helpers: upgrade in place, never duplicate.
    if (next.includes('function dshuiPickBridgeForPath')) {
      if (!next.includes(BRIDGE_TOKEN_PATCH_MARKER) || !next.includes(BRIDGE_ORIGIN_MARKER)) {
        // Replace the entire old bridge-helper block. It was inserted either
        // directly before `openNativePathWithIntent` or together with the
        // `dshuiVscodeFileUrl` helper; preserve the URL helper when present.
        const bridgeComment = 'dshui patch: ask the hosting VS Code'
        const bridgeAt = next.indexOf(bridgeComment)
        const blockStart = bridgeAt === -1 ? -1 : next.lastIndexOf('/**', bridgeAt)
        const urlHelperAt = next.indexOf('dshui patch: absolute path as a', bridgeAt)
        const openerAt = next.indexOf(openerSignature, bridgeAt)
        let blockEnd = openerAt
        if (urlHelperAt !== -1 && urlHelperAt < openerAt) blockEnd = urlHelperAt
        if (blockStart === -1 || blockEnd === -1) {
          return { patched: false, note: 'unrecognized bridge helper; leaving file unchanged' }
        }
        next = `${next.slice(0, blockStart)}${BRIDGE_FUNCTIONS}${next.slice(blockEnd)}`
      }
    } else if (source.includes(OLD_BRIDGE_HELPER)) {
      next = next.replace(OLD_BRIDGE_HELPER, BRIDGE_FUNCTIONS)
    } else if (!next.includes('function dshuiOpenViaBridge')) {
      next = next.replace(
        openerSignature,
        `${next.includes('function dshuiVscodeFileUrl') ? BRIDGE_FUNCTIONS : HELPER}${openerSignature}`,
      )
    } else {
      return { patched: false, note: 'unrecognized bridge helper; leaving file unchanged' }
    }
    if (!next.includes('function dshuiOpenViaCli')) {
      next = next.replace(
        openerSignature,
        `${CLI_HELPER}${openerSignature}`,
      )
    }
    // Keep the click origin in the host.openPath payload (zod strips unknown
    // keys by default, so without this the handler would never see it).
    if (next.includes(OPEN_PATH_SCHEMA) && !next.includes(OPEN_PATH_SCHEMA_ORIGIN)) {
      next = next.replace(OPEN_PATH_SCHEMA, OPEN_PATH_SCHEMA_ORIGIN)
    }
    // Thread the origin from the request payload into the native open call.
    if (next.includes(OPEN_PATH_CALLER) && !next.includes(OPEN_PATH_CALLER_ORIGIN)) {
      next = next.replace(OPEN_PATH_CALLER, OPEN_PATH_CALLER_ORIGIN)
    }
    if (next.includes(OPEN_TEXT_CALLER) && !next.includes(OPEN_TEXT_CALLER_ORIGIN)) {
      next = next.replace(OPEN_TEXT_CALLER, OPEN_TEXT_CALLER_ORIGIN)
    }
    fs.writeFileSync(apiProxyLibPath, next)
    return { patched: true, note: 'patched' }
  } catch (error) {
    return { patched: false, note: `patch write failed (${String(error)}); native opener left unchanged` }
  }
}
