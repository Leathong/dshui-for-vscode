const SANDBOX_MODES = new Set(['read-only', 'workspace-write', 'danger-full-access']);
/**
 * Resolve the per-call fs sandbox policy for one live session. Prefers the
 * composition's `sandboxPolicy` service (which honours session mode
 * overrides); falls back to workspace-write bounded by the session cwd.
 */
export function sandboxPolicyFor(ctx, session) {
    let service;
    try {
        service = ctx.get('sandboxPolicy');
    }
    catch {
        service = undefined;
    }
    if (service !== undefined && typeof service.resolve === 'function') {
        try {
            const resolved = service.resolve({ session });
            if (resolved !== undefined && typeof resolved.mode === 'string' && SANDBOX_MODES.has(resolved.mode) && typeof resolved.workspaceRoot === 'string' && resolved.workspaceRoot !== '') {
                return { mode: resolved.mode, workspaceRoot: resolved.workspaceRoot };
            }
        }
        catch {
            // Fall through to the cwd-derived policy.
        }
    }
    const cwd = session.header.cwd;
    if (cwd === undefined || cwd === '')
        return undefined;
    return { mode: 'workspace-write', workspaceRoot: cwd };
}
/**
 * Policy for restoration paths without a live session (startup reconciliation
 * of interrupted journals): the guard's recorded cwd is the honest boundary.
 */
export function sandboxPolicyForCwd(cwd) {
    if (cwd === '')
        return undefined;
    return { mode: 'workspace-write', workspaceRoot: cwd };
}
