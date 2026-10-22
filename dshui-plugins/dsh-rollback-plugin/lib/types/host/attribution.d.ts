import type { RollbackCordisContext, Session } from './context.ts';
import type { GitProvider } from './providers/git.ts';
import type { TrackedCall } from './tracking.ts';
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
/**
 * Post-image blob of each call, keyed by `callId`. Deletions map to
 * `undefined`; calls without a usable post-image are absent from the map so
 * callers can tell "the call removed the file" from "nothing recorded".
 */
export declare function callPostImages(provider: GitProvider, calls: readonly TrackedCall[]): Promise<Map<string, string | undefined>>;
/**
 * Paths whose current content cannot be attributed to this session's newest
 * write/edit call.
 *
 * A path without any tracked call was never written by this session's tools,
 * so it is foreign. A path whose newest call has no usable post-image
 * (oversized, superseded, never frozen) stays on this session's side (the
 * permissive legacy semantics). Otherwise the call's post-image must equal the
 * current blob; anything else — another session, an editor, bash, or a later
 * overwrite — is foreign.
 *
 * `current` optionally supplies the worktree blob of every path (the session
 * modification list already has it as `probe`); when omitted it is hashed in
 * one batch.
 */
export declare function foreignPaths(provider: GitProvider, calls: readonly TrackedCall[], paths: readonly string[], current?: ReadonlyMap<string, string | undefined>): Promise<Set<string>>;
