import { NS, en, zh } from "./locales.js";
import ROLLBACK_REMOTE from "./remote.js";
import { ModificationDock } from "./ModificationDock.js";
import { MessageRollbackAction, TurnRollbackAction } from "./RollbackAction.js";
// `remote.rollback` must NOT appear in `inject`: the namespace service only
// exists after `ctx.remote.$mount(ROLLBACK_REMOTE)` runs below, i.e. inside
// this very apply(). Injecting it would make apply() wait for a service that
// only apply() itself creates — the fiber stays pending forever and web boot
// fails with "dsh-rollback-plugin: pending (waiting for service: remote.rollback)".
export const inject = ['slots', 'remote', 'locale', 'sessions', 'workspaces'];
/**
 * Mirrors the native chat message action button (28×28 hit area, borderless,
 * 16px icon, hover background) so the rollback entry blends into the action row.
 */
const ACTION_CSS = '.dsh-rollback-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}' +
    '.dsh-rollback-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}';
/**
 * Composer modification-list dock: same panel geometry as the shipped
 * todo/queue docks (--dsh-composer-* variables), so the strip sits above the
 * input card like the task list.
 */
const DOCK_CSS = '.dsh-mod-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto calc(0px - var(--dsh-composer-stack-gap) - 3px);padding:0 var(--dsh-composer-dock-inset);flex:none}' +
    '.dsh-mod-panel{background:var(--dsw-specific-tip);border-radius:12px 12px 0 0;width:100%;padding:2px 0;position:relative;overflow:hidden}' +
    '.dsh-mod-panel:after{border:1px solid var(--dsw-alias-border-l1);border-radius:inherit;content:"";pointer-events:none;border-bottom:none;position:absolute;inset:0}' +
    '.dsh-mod-header{box-sizing:border-box;width:100%;min-height:36px;color:var(--dsw-alias-label-primary);border-radius:8px;align-items:center;gap:4px;padding:4px 12px 4px 8px;display:flex}' +
    '.dsh-mod-toggle{box-sizing:border-box;min-width:0;flex:auto;min-height:32px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:center;gap:10px;padding:4px;display:flex}' +
    '.dsh-mod-toggle:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}' +
    '.dsh-mod-header-actions{flex:none;align-items:center;gap:4px;display:flex}' +
    '.dsh-mod-lead{color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;display:grid}' +
    '.dsh-mod-count{min-width:0;font-family:Inter,var(--dsw-font-family);flex:auto;font-size:13px;font-weight:500;line-height:24px}' +
    '.dsh-mod-loading{opacity:.6}' +
    '.dsh-mod-accepted-chip{flex:none;font-family:Inter,var(--dsw-font-family);font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 8px}' +
    '.dsh-mod-chevron{width:14px;height:14px;color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;display:grid}' +
    '.dsh-mod-baseline{font-family:Inter,var(--dsw-font-family);font-size:12px;color:var(--dsw-alias-label-secondary);padding:2px 12px;display:flex;gap:6px;align-items:center}' +
    '.dsh-mod-warn{width:14px;height:14px;color:#b8860b;display:grid;place-items:center}' +
    '.dsh-mod-note{font-family:Inter,var(--dsw-font-family);font-size:12px;color:var(--dsw-alias-label-tertiary);padding:4px 12px}' +
    '.dsh-mod-empty{font-family:Inter,var(--dsw-font-family);font-size:12px;color:var(--dsw-alias-label-tertiary);padding:6px 12px}' +
    '.dsh-mod-list{max-height:240px;margin:0;padding:0 4px;list-style:none;overflow-y:auto}' +
    '.dsh-mod-file{border-radius:8px}' +
    '.dsh-mod-file:hover{background:var(--dsw-alias-interactive-bg-hover)}' +
    '.dsh-mod-file-row{box-sizing:border-box;border-radius:8px;align-items:center;gap:8px;width:100%;min-height:32px;padding:4px 5px 4px 12px;display:flex}' +
    '.dsh-mod-file-path{min-width:0;flex:auto;display:flex;align-items:center;gap:6px;background:0 0;border:none;cursor:pointer;text-align:left;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);font-family:Inter,var(--dsw-font-family);padding:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}' +
    '.dsh-mod-file-path:hover{text-decoration:underline}' +
    '.dsh-mod-status{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}' +
    '.dsh-mod-status-dot{flex:none;width:8px;height:8px;border-radius:999px;background:var(--dsw-alias-state-business-primary)}' +
    '.dsh-mod-status-modified{background:var(--dsw-alias-state-business-primary)}' +
    '.dsh-mod-status-created{background:#2ea043}' +
    '.dsh-mod-status-deleted{background:#d1242f}' +
    '.dsh-mod-status-typechange,.dsh-mod-status-binary,.dsh-mod-status-ignored,.dsh-mod-status-nested-repo{background:#b8860b}' +
    '.dsh-mod-actions{flex:none;align-items:center;gap:6px;display:flex}' +
    '.dsh-mod-action{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;flex:none;place-items:center;padding:0;display:grid}' +
    '.dsh-mod-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}' +
    '.dsh-mod-action:disabled{cursor:default;opacity:.45}' +
    '.dsh-mod-link{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;place-items:center;padding:0;display:grid}' +
    '.dsh-mod-link:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}' +
    '.dsh-mod-spin{display:inline-block;font-size:14px;line-height:1;animation:dsh-mod-rotate 1s linear infinite}' +
    '@keyframes dsh-mod-rotate{to{transform:rotate(360deg)}}' +
    '.dsh-mod-confirm{display:inline-flex;gap:4px;align-items:center}' +
    '.dsh-mod-confirm-yes{font:var(--dsw-font-xs-13);color:#d1242f;background:0 0;border:1px solid #d1242f;border-radius:6px;cursor:pointer;padding:1px 8px;height:22px}' +
    '.dsh-mod-confirm-no{font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-secondary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;cursor:pointer;padding:1px 8px;height:22px}' +
    '.dsh-mod-detail{padding:2px 12px 8px;display:flex;flex-direction:column;gap:6px}' +
    '.dsh-mod-patches{border-left:2px solid var(--dsw-alias-border-l1);padding-left:10px;display:flex;flex-direction:column;gap:6px}' +
    '.dsh-mod-patches-title{font-size:11px;color:var(--dsw-alias-label-tertiary)}' +
    '.dsh-mod-patch{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:4px;background:var(--dsw-alias-bg-base)}' +
    '.dsh-mod-patch-accepted{opacity:.65}' +
    '.dsh-mod-patch-row{display:flex;align-items:center;gap:8px;min-height:24px}' +
    '.dsh-mod-patch-name{flex:auto;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:0 0;border:none;cursor:pointer;text-align:left;padding:0}' +
    '.dsh-mod-accepted{font-size:11px;color:var(--dsw-alias-label-tertiary)}' +
    '.dsh-mod-warn-text{font-size:11px;color:#b8860b;display:inline-flex;align-items:center;gap:2px;white-space:nowrap}' +
    '.dsh-mod-accepted-toggle{width:100%;background:0 0;border:none;cursor:pointer;color:var(--dsw-alias-label-tertiary);font-size:12px;font-family:Inter,var(--dsw-font-family);text-align:left;padding:6px 12px}' +
    '.dsh-mod-accepted-toggle:hover{color:var(--dsw-alias-label-secondary)}' +
    '.dsh-mod-list-accepted{opacity:.7;max-height:140px}' +
    '.dsh-mod-file-accepted .dsh-mod-file-path{color:var(--dsw-alias-label-secondary)}' +
    '.dsh-mod-tools{display:flex;justify-content:flex-end;padding:2px 8px 4px}' +
    '.dsh-mod-tool{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;place-items:center;padding:0;display:grid}' +
    '.dsh-mod-tool:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}';
export async function apply(ctx) {
    const tagId = 'dsh-rollback-plugin/action';
    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) === null) {
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-rollback-plugin';
        tag.dataset.pluginCss = tagId;
        tag.textContent = ACTION_CSS + DOCK_CSS;
        document.head.appendChild(tag);
    }
    const sessions = ctx.sessions;
    const unmountRemote = await ctx.remote.$mount(ROLLBACK_REMOTE);
    ctx.effect(() => () => { void unmountRemote(); }, 'rollback remote teardown');
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'rollback dictionaries');
    // Capture the mounted namespace service; it only exists after $mount settled.
    const rollback = ctx.get('remote.rollback');
    const rollbackFace = (sessionId) => ({
        prepare: target => target.messageId !== undefined
            ? rollback.prepare(sessionId, target.messageId)
            : rollback.prepareTurn(sessionId, target.turn ?? 0),
        execute: (target, request) => rollback.execute({
            sessionId,
            ...(target.messageId !== undefined ? { messageId: target.messageId } : { turn: target.turn }),
            ...request,
        }),
        openAt: (path, line) => rollback.openAt(sessionId, path, line),
        forkAt: async (seq) => {
            const childId = await sessions.fork({ sessionId, atSeq: seq, increaseTitle: true });
            sessions.open(childId);
            return childId;
        },
    });
    ctx.slots.inject('conversation.chat.assistant-actions', () => {
        const dispose = ctx.slots.register({
            name: 'conversation.chat.assistant-actions',
            id: 'rollback',
            order: 20,
            locale: NS,
            inject: (sessionId) => rollbackFace(sessionId),
        }, MessageRollbackAction);
        return dispose;
    });
    // Unfinished (stopped/interrupted) turns: the closing assistant never
    // renders its action row, so the rollback entry rides the turn tail chain.
    // The selector matches turns WITHOUT a text closing assistant (replicating
    // the shipped tail's `closing` computation) — exactly the turns whose
    // assistant-message button is absent. Priority 100 lets the shipped
    // deliverables entry (priority 0, produced-files tail) win when it claims
    // the chain; completed turns keep using the assistant-message button above.
    const hasClosingAssistant = (owner) => {
        for (const step of owner.turn.steps) {
            const data = step.data.get('assistant-step');
            if (data === undefined || data.finalNode === undefined)
                continue;
            if (data.blocks.some(block => block.kind === 'text' && block.text.trim() !== ''))
                return true;
        }
        return false;
    };
    ctx.slots.inject('conversation.chat.turnTail', () => {
        const dispose = ctx.slots.register({
            name: 'conversation.chat.turnTail',
            priority: 100,
            locale: NS,
            select: (owner) => hasClosingAssistant(owner) ? null : { turn: owner.turn.turn },
            inject: (sessionId) => rollbackFace(sessionId),
        }, TurnRollbackAction);
        return dispose;
    });
    // Composer modification list: one strip above the input card, ordered
    // right after the todo strip (order 0) and before goal/queue.
    ctx.slots.inject('conversation.input.dock', () => {
        const dispose = ctx.slots.register({
            name: 'conversation.input.dock',
            id: 'modifications',
            order: 5,
            locale: NS,
            inject: (sessionId) => ({
                sessionChanges: () => rollback.sessionChanges(sessionId),
                acceptAll: listId => rollback.acceptAll({ sessionId, listId }),
                undoAll: listId => rollback.undoAll({ sessionId, listId }),
                acceptFile: (path, listId) => rollback.acceptFile({ sessionId, path, listId }),
                acceptModification: (modificationId, path, listId) => rollback.acceptModification({ sessionId, modificationId, path, listId }),
                undoFile: (path, listId) => rollback.undoFile({ sessionId, path, listId }),
                undoModification: (modificationId, listId) => rollback.undoModification({ sessionId, modificationId, listId }),
                openAt: (path, line) => rollback.openAt(sessionId, path, line),
            }),
        }, ModificationDock);
        return dispose;
    });
    return async () => {
        await unmountRemote();
    };
}
