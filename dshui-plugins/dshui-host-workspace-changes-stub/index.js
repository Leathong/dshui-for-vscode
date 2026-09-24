/**
 * dshui host plugin: the empty stand-in for the official
 * `@deepseek-ai/dsh-workspace-changes` recorder.
 *
 * patch.yml disables the stock `workspace-changes` row, so nothing records a
 * per-turn change summary any more. That row is also the only provider of the
 * `workspaceChanges` service, and the Host half of `@deepseek-ai/dsh-client-ui-deliverables`
 * hard-injects it: a missing service leaves that entry PENDING forever, which
 * silently takes the present delivery cards, the authenticated native opens,
 * the closing-message file mentions, and the deliverable file-reference system
 * prompt section with it. This plugin provides the same service with an empty
 * answer, so those surfaces stay and only the changed-files card disappears.
 *
 * `summary` and `diff` returning undefined makes the `/api/changes.summary`
 * and `/api/changes.diff` routes answer 404 (the "no longer available" path),
 * which the browser never requests anyway: with no recorder there is no
 * `workspace/changes` event, so the changed-files card is never matched.
 *
 * MAINTENANCE: re-read `@deepseek-ai/dsh-workspace-changes`'s `types.ts` on
 * every dsh upgrade. If `WorkspaceChanges` gains a method, add it here as an
 * undefined-returning stand-in; a missing method surfaces as a TypeError in
 * the ui-deliverables route instead of the 404 the browser expects.
 */
export const name = 'dshui-host-workspace-changes-stub'

export function apply(ctx) {
  ctx.provide('workspaceChanges', {
    summary: () => undefined,
    diff: () => Promise.resolve(undefined),
  })
}
