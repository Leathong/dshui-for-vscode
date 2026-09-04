import type { RollbackCordisContext, Session } from './context.ts';
/**
 * True when the session was created as a subagent child. This is the coarse
 * durable classification stamped at creation (`SessionHeader.origin`), not a
 * runtime ownership probe, so it survives restart and resume.
 */
export declare function isSubagentSession(session: Session): boolean;
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
export declare function attributionSession(ctx: RollbackCordisContext, session: Session): Session;
