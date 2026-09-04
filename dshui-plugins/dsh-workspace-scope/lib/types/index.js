/**
 * dsh-workspace-scope — Host half.
 *
 * Workspace config is locked on the first real Agent prompt assembly. MCP
 * restrictions are reconciled before the authoritative assembly reaches the
 * model; Skill shadows are refreshed immediately before DSH's skill catalog.
 */
export const name = "dsh-workspace-scope";
export const inject = ["webServer", "fs", "skills", "tools", "agents", "systemPrompt"];
const CONFIG_FILE = ".dsh/scope.json";
const ROUTE_PREFIX = "/api/dsh-workspace-scope";
const MAX_BODY_BYTES = 65536;
const DEFAULT_CONFIG = { mode: "default", skills: [], mcps: [] };
export function parseScopeConfig(text) {
    if (text === undefined || text === "")
        return { ...DEFAULT_CONFIG };
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
    const row = typeof parsed === "object" && parsed !== null
        ? parsed.default
        : undefined;
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
        return { ...DEFAULT_CONFIG };
    }
    const r = row;
    return {
        mode: r.mode === "whitelist" || r.mode === "blacklist" ? r.mode : "default",
        skills: Array.isArray(r.skills)
            ? r.skills.filter((x) => typeof x === "string")
            : [],
        mcps: Array.isArray(r.mcps)
            ? r.mcps.filter((x) => typeof x === "string")
            : [],
    };
}
function excludedNames(mode, selected, all) {
    if (mode === "default")
        return [];
    const set = new Set(selected);
    return mode === "whitelist"
        ? all.filter((name) => !set.has(name))
        : all.filter((name) => set.has(name));
}
export function deniedServers(cfg, allServers) {
    return excludedNames(cfg.mode, cfg.mcps, allServers);
}
export function deniedSkills(cfg, allSkills) {
    return excludedNames(cfg.mode, cfg.skills, allSkills);
}
export function apply(ctx) {
    const webServer = ctx.get("webServer");
    const fs = ctx.get("fs");
    const skills = ctx.get("skills");
    const tools = ctx.get("tools");
    const agents = ctx.get("agents");
    const systemPrompt = ctx.get("systemPrompt");
    async function readConfig(cwd) {
        if (cwd === undefined || cwd === "")
            return { ...DEFAULT_CONFIG };
        try {
            const target = await fs.resolve(`${cwd}/${CONFIG_FILE}`);
            return parseScopeConfig(await fs.readText(target));
        }
        catch {
            return { ...DEFAULT_CONFIG };
        }
    }
    // ponytail: one queue is enough; split per cwd only if config-write throughput matters.
    let configWriteQueue = Promise.resolve();
    function writeConfig(cwd, cfg, session) {
        const write = configWriteQueue.then(async () => {
            if (cwd === undefined || cwd === "") {
                return { saved: false, reason: "无法确定工作目录，未保存" };
            }
            try {
                const target = await fs.resolve(`${cwd}/${CONFIG_FILE}`);
                let all = {};
                try {
                    const parsed = JSON.parse(await fs.readText(target));
                    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                        all = parsed;
                    }
                }
                catch {
                    // Missing or invalid file: write a fresh document.
                }
                all.default = cfg;
                const sandboxPolicy = ctx.get("sandboxPolicy");
                const policy = sandboxPolicy !== undefined && session !== undefined
                    ? sandboxPolicy.resolve({ session, mode: "workspace-write" })
                    : undefined;
                await fs.writeText(target, JSON.stringify(all, null, 2), undefined, undefined, policy);
                return { saved: true };
            }
            catch (err) {
                return {
                    saved: false,
                    reason: String((err && err.message) || err),
                };
            }
        });
        configWriteQueue = write.then(() => undefined);
        return write;
    }
    function resolveAgent(sessionId) {
        return sessionId === "" ? undefined : agents.get(sessionId);
    }
    function globalMcpToolsMap() {
        const byServer = new Map();
        // DSH 0.1.2-rc.1 validates MCP server names as [A-Za-z0-9_-]{1,32}
        // and publishes every Host-global MCP tool as mcp__<server>__<tool>.
        for (const schema of tools.schemas()) {
            const match = /^mcp__([A-Za-z0-9_-]{1,32})__(.+)$/.exec(schema.name);
            if (match === null)
                continue;
            const server = match[1];
            const names = byServer.get(server) ?? [];
            if (!byServer.has(server))
                byServer.set(server, names);
            names.push(schema.name);
        }
        return byServer;
    }
    function deniedMcpTools(cfg, byServer) {
        return deniedServers(cfg, [...byServer.keys()])
            .flatMap((server) => byServer.get(server) ?? [])
            .sort();
    }
    function disposeAll(disposers) {
        for (const dispose of disposers.reverse()) {
            try {
                dispose();
            }
            catch {
                // Agent scope teardown may already have removed the registration.
            }
        }
    }
    function safeDispose(dispose) {
        if (dispose === undefined)
            return;
        try {
            dispose();
        }
        catch {
            // Agent scope teardown may already have removed the registration.
        }
    }
    async function installSkillPolicy(agent, cfg, signal) {
        if (cfg.mode === "default")
            return undefined;
        const view = { scope: agent, cwd: agent.session.header.cwd, signal };
        const snapshot = await skills.snapshot(view);
        signal.throwIfAborted();
        if (!snapshot.complete) {
            throw new Error("dsh-workspace-scope: skill catalog is incomplete");
        }
        const denied = new Set(deniedSkills(cfg, snapshot.skills.map((skill) => skill.name)));
        if (denied.size === 0)
            return undefined;
        // Resolve through ctx.get(): the agent scope's fiber ancestry never
        // injected "skills", so property access cannot reach the service. A
        // missing service fails the step closed rather than running unmasked.
        const scopedSkills = agent.ctx.get("skills");
        if (scopedSkills === undefined) {
            throw new Error("dsh-workspace-scope: skills service is unavailable in the agent scope");
        }
        const disposers = [];
        try {
            for (const summary of snapshot.skills) {
                if (!denied.has(summary.name) || summary.invocation?.modelInvocable === false)
                    continue;
                const definition = await skills.get(summary.name, view);
                signal.throwIfAborted();
                if (definition === undefined || definition.invocation?.modelInvocable === false)
                    continue;
                disposers.push(scopedSkills.register({
                    ...definition,
                    invocation: {
                        ...definition.invocation,
                        modelInvocable: false,
                        userInvocable: definition.invocation?.userInvocable !== false,
                    },
                }));
            }
            const verified = await skills.snapshot(view);
            signal.throwIfAborted();
            if (!verified.complete) {
                throw new Error("dsh-workspace-scope: skill catalog is incomplete");
            }
            const exposed = verified.skills.find((skill) => denied.has(skill.name) && skill.invocation?.modelInvocable !== false);
            if (exposed !== undefined) {
                throw new Error(`dsh-workspace-scope: failed to hide skill "${exposed.name}"`);
            }
            return disposers.length === 0 ? undefined : () => disposeAll(disposers);
        }
        catch (err) {
            disposeAll(disposers);
            throw err;
        }
    }
    const activePolicies = new Map();
    const onEvent = ctx.on;
    ctx.effect(() => () => {
        for (const policy of activePolicies.values()) {
            safeDispose(policy.skillDispose);
            safeDispose(policy.mcpDispose);
        }
        activePolicies.clear();
    });
    onEvent("agent/disposed", ({ agent }) => {
        const policy = activePolicies.get(agent.id);
        safeDispose(policy?.skillDispose);
        safeDispose(policy?.mcpDispose);
        activePolicies.delete(agent.id);
    });
    // The AgentLoop assembles before agent/pre-step. Lock config at the first
    // turn-owned assembly (a real model step has a signal; diagnostics need not
    // lock anything). If the MCP mask changes, rebuild the whole assembly once
    // under the new native restriction so native and PTC presentations agree.
    onEvent("system-prompt/assemble", async (_assembly, context, next) => {
        const agent = context.agent;
        const signal = context.signal;
        if (agent === undefined || signal === undefined)
            return next();
        signal.throwIfAborted();
        let active = activePolicies.get(agent.id);
        if (active === undefined) {
            const config = await readConfig(agent.session.header.cwd);
            signal.throwIfAborted();
            active = { agent, config };
            activePolicies.set(agent.id, active);
        }
        const denied = deniedMcpTools(active.config, globalMcpToolsMap());
        const key = JSON.stringify(denied);
        if (active.mcpKey === key)
            return next();
        const replacement = denied.length === 0
            ? undefined
            : agent.ctx.tools.restrict({ deny: denied });
        const previous = active.mcpDispose;
        active.mcpDispose = replacement;
        active.mcpKey = key;
        safeDispose(previous);
        // No restriction existed and none is needed: the assembly already built
        // by DSH is authoritative. Every other change requires one clean rebuild.
        if (previous === undefined && replacement === undefined)
            return next();
        signal.throwIfAborted();
        return systemPrompt.assemble(context);
    }, { prepend: true });
    onEvent("agent/pre-step", async (payload, next) => {
        payload.signal.throwIfAborted();
        const active = activePolicies.get(payload.agent.id);
        if (active === undefined) {
            // A plugin load that races an already-built assembly must fail closed.
            throw new Error("dsh-workspace-scope: workspace policy is not initialized");
        }
        // Remove our previous runtime shadow before discovery. Otherwise the
        // scoped snapshot sees modelInvocable:false and cannot rebuild itself.
        const previous = active.skillDispose;
        delete active.skillDispose;
        safeDispose(previous);
        active.skillDispose = await installSkillPolicy(payload.agent, active.config, payload.signal);
        return next();
    }, { prepend: true });
    async function overviewResult(sessionId) {
        const agent = resolveAgent(sessionId);
        const cwd = agent?.session.header.cwd;
        let skillList = [];
        try {
            const snapshot = await skills.snapshot(agent === undefined ? { cwd } : { scope: agent, cwd });
            skillList = snapshot.skills.map((skill) => ({
                name: skill.name,
                description: skill.description ?? "",
            }));
        }
        catch {
            // An unavailable provider should not break the management UI.
        }
        const byServer = globalMcpToolsMap();
        const mcp = [...byServer.keys()].sort().map((server) => ({
            server,
            toolCount: (byServer.get(server) ?? []).length,
        }));
        return { skills: skillList, mcp, config: await readConfig(cwd) };
    }
    async function saveResult(body) {
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
        const agent = resolveAgent(sessionId);
        const cfg = {
            mode: body.mode === "whitelist" || body.mode === "blacklist"
                ? body.mode
                : "default",
            skills: Array.isArray(body.skills)
                ? body.skills.filter((x) => typeof x === "string")
                : [],
            mcps: Array.isArray(body.mcps)
                ? body.mcps.filter((x) => typeof x === "string")
                : [],
        };
        return writeConfig(agent?.session.header.cwd, cfg, agent?.session);
    }
    function readBody(req) {
        return new Promise((resolve, reject) => {
            let data = "";
            req.setEncoding("utf8");
            req.on("data", (chunk) => {
                data += chunk;
                if (data.length > MAX_BODY_BYTES) {
                    reject(new Error("body too large"));
                    req.destroy();
                }
            });
            req.on("end", () => resolve(data));
            req.on("error", reject);
        });
    }
    const handler = async (req, res) => {
        const send = (status, body) => {
            res.statusCode = status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify(body));
        };
        try {
            // The dynamic sandbox has no URL/URLSearchParams globals.
            const raw = req.url ?? "/";
            const qIndex = raw.indexOf("?");
            const path = (qIndex === -1 ? raw : raw.slice(0, qIndex)) || "/";
            const sessionIdParam = () => {
                if (qIndex === -1)
                    return "";
                for (const pair of raw.slice(qIndex + 1).split("&")) {
                    if (pair === "")
                        continue;
                    const eq = pair.indexOf("=");
                    if ((eq === -1 ? pair : pair.slice(0, eq)) !== "sessionId")
                        continue;
                    const value = eq === -1 ? "" : pair.slice(eq + 1);
                    try {
                        return decodeURIComponent(value);
                    }
                    catch {
                        return value;
                    }
                }
                return "";
            };
            const known = path === `${ROUTE_PREFIX}/overview` || path === `${ROUTE_PREFIX}/save`;
            if (req.method === "GET" && path === `${ROUTE_PREFIX}/overview`) {
                send(200, await overviewResult(sessionIdParam()));
            }
            else if (req.method === "POST" && path === `${ROUTE_PREFIX}/save`) {
                send(200, await saveResult(JSON.parse(await readBody(req))));
            }
            else if (known) {
                send(405, { error: "method not allowed" });
            }
            else {
                send(404, { error: "not found" });
            }
        }
        catch (err) {
            send(500, { error: String((err && err.message) || err) });
        }
    };
    ctx.effect(() => webServer.register({ kind: "prefix", path: ROUTE_PREFIX, handler }));
    if (typeof harness !== "undefined") {
        harness.handle("overview", async (args) => {
            try {
                return await overviewResult(typeof args?.sessionId === "string" ? args.sessionId : "");
            }
            catch (err) {
                return { error: String((err && err.message) || err) };
            }
        });
        harness.handle("save", async (args) => {
            try {
                return await saveResult((args ?? {}));
            }
            catch (err) {
                return { error: String((err && err.message) || err) };
            }
        });
    }
}
