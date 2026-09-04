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
        if (payload.step === 1 && service.config.snapshotOnPreStep && !isSubagentSession(payload.agent.session)) {
            try {
                await service.snapshots.capture(payload.agent.session, payload.turn);
            }
            catch (error) {
                host.logger.warn('rollback snapshot skipped:', error);
            }
        }
        return next();
    }, { prepend: true });
    installLedgerListeners(ctx, service);
    void service.safety.reconcileRunning(host, service.snapshots, service.ledger).catch((error) => {
        host.logger.warn('rollback startup reconciliation skipped:', error);
    });
}
export function installLedgerListeners(ctx, service) {
    const host = ctx;
    ctx.on('fs/write-intent', (target, actor, next) => {
        return service.ledger.captureWriteBefore(target, actor, next);
    }, { prepend: true });
    ctx.on('fs/edit-intent', (target, actor, next) => {
        return service.ledger.captureEditBefore(target, actor, next);
    }, { prepend: true });
    ctx.on('fs/observed', (target, observation, actor) => {
        try {
            service.ledger.observe(target, observation, actor);
        }
        catch (error) {
            host.logger.warn('rollback ledger observation failed:', error);
        }
    });
}
