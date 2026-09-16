import { isSubagentSession } from "./attribution.js";
import { RollbackService } from "./service.js";
import { ROLLBACK_HOST_TYPERT } from "./typert.js";
export const name = 'rollback';
export const inject = ['sessions', 'agents', 'fs', 'typert'];
export function apply(ctx, options = {}) {
    if (options.enabled === false)
        return;
    const host = ctx;
    const service = new RollbackService(ctx, options);
    // Host Typert reflection and invocation descriptors (strict JSON codecs).
    const typert = ctx.typert;
    if (typert !== undefined) {
        ctx.effect(() => typert.register(ROLLBACK_HOST_TYPERT), 'rollback: typert host contribution');
    }
    else {
        host.logger.warn('rollback: typert service unavailable; Remote methods may use the SRC fallback');
    }
    ctx.on('agent/pre-step', async (payload, next) => {
        // Subagent sessions are excluded from tracking: their modifications are
        // attributed to the main session (see attribution.ts), whose own pre-step
        // snapshot already covers the whole turn the subagent runs in. Capturing
        // per-subagent snapshots would only pollute the workspace timeline with
        // manifests no modification list ever queries.
        const session = payload.agent.session;
        const cwd = session.header?.cwd;
        if (payload.step === 1 && service.config.trackingEnabled && cwd !== undefined && cwd !== '' && !isSubagentSession(session)) {
            try {
                // Freeze the previous turn's per-call chain before the new turn starts,
                // then make sure the chain base exists for the turn about to run.
                await service.tracker.flush(session.id);
                await service.tracker.ensureBase(session.id, cwd);
            }
            catch (error) {
                host.logger.warn('rollback call tracking skipped:', error);
            }
        }
        if (payload.step === 1 && service.config.snapshotOnPreStep && !isSubagentSession(session)) {
            try {
                await service.snapshots.capture(session, payload.turn);
            }
            catch (error) {
                host.logger.warn('rollback snapshot skipped:', error);
            }
        }
        return next();
    }, { prepend: true });
    installTrackingListeners(ctx, service);
    void service.safety.reconcileRunning(host, service.snapshots).catch((error) => {
        host.logger.warn('rollback startup reconciliation skipped:', error);
    });
}
/**
 * Per-call tracking listens to `fs/observed` only: the git-native model needs
 * no before-image, so the write/edit *intent* hooks (and their synchronous
 * whole-file read on the tool critical path) are gone.
 */
export function installTrackingListeners(ctx, service) {
    const host = ctx;
    ctx.on('fs/observed', (target, observation, actor) => {
        if (!service.config.trackingEnabled)
            return;
        try {
            service.tracker.observe(target, observation, actor);
        }
        catch (error) {
            host.logger.warn('rollback call tracking failed:', error);
        }
    });
}
