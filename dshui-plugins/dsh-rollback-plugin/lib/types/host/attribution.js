/**
 * Depth cap for the parent-lineage walk. Subagent delegation is bounded by
 * the runtime's recursion budget; the cap only guards against corrupt or
 * cyclic lineage metadata looping forever.
 */
const MAX_ATTRIBUTION_DEPTH = 16;
/**
 * True when the session was created as a subagent child. This is the coarse
 * durable classification stamped at creation (`SessionHeader.origin`), not a
 * runtime ownership probe, so it survives restart and resume.
 */
export function isSubagentSession(session) {
    return session.header?.origin === 'subagent';
}
/**
 * The session a modification is attributed to. Subagent sessions are folded
 * into their main (top-level) session by walking the durable `parentSession`
 * lineage, so every write/edit a subagent performs shows up in the main
 * agent's modification list and turn coordinates instead of a separate,
 * mostly invisible subagent session list. Sessions without subagent origin
 * (main sessions, forks) are their own attribution target; a subagent whose
 * parent chain is not live falls back to itself, preserving pre-fold
 * behaviour for orphan sessions.
 */
export function attributionSession(ctx, session) {
    let current = session;
    for (let depth = 0; depth < MAX_ATTRIBUTION_DEPTH && isSubagentSession(current); depth += 1) {
        const parentId = current.header?.parentSession;
        if (parentId === undefined)
            return current;
        const parent = ctx.sessions?.get(parentId);
        if (parent === undefined || parent.id === current.id)
            return current;
        current = parent;
    }
    return current;
}
