import type { RollbackCordisContext, Session } from './context.ts';
/**
 * Structural twin of `SandboxExecutionPolicy` from `@deepseek-ai/dsh-sandbox`
 * (which this bundle does not depend on). Passing it as the `sandboxPolicy`
 * argument of `ctx.fs.writeText`/`editText` fences the write against the
 * SESSION workspace root instead of the deployment fallback root — without
 * it, a sandboxing fs backend resolves the policy without a session context
 * and denies every write outside the host's default workspace.
 */
export interface RollbackSandboxPolicy {
    mode: 'read-only' | 'workspace-write' | 'danger-full-access';
    workspaceRoot: string;
}
/**
 * Resolve the per-call fs sandbox policy for one live session. Prefers the
 * composition's `sandboxPolicy` service (which honours session mode
 * overrides); falls back to workspace-write bounded by the session cwd.
 */
export declare function sandboxPolicyFor(ctx: RollbackCordisContext, session: Session): RollbackSandboxPolicy | undefined;
/**
 * Policy for restoration paths without a live session (startup reconciliation
 * of interrupted journals): the guard's recorded cwd is the honest boundary.
 */
export declare function sandboxPolicyForCwd(cwd: string): RollbackSandboxPolicy | undefined;
