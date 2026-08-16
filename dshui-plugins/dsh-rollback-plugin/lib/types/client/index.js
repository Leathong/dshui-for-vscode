import { NS, en, zh } from "./locales.js";
import ROLLBACK_REMOTE from "./remote.js";
import { RollbackAction } from "./RollbackAction.js";
export const inject = ['slots', 'remote', 'remote.rollback', 'locale', 'sessions', 'workspaces'];
/**
 * Mirrors the native chat message action button (28×28 hit area, borderless,
 * 16px icon, hover background) so the rollback entry blends into the action row.
 */
const ACTION_CSS = '.dsh-rollback-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}' +
    '.dsh-rollback-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}';
export async function apply(ctx) {
    const tagId = 'dsh-rollback-plugin/action';
    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) === null) {
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-rollback-plugin';
        tag.dataset.pluginCss = tagId;
        tag.textContent = ACTION_CSS;
        document.head.appendChild(tag);
    }
    const sessions = ctx.sessions;
    const unmountRemote = await ctx.remote.$mount(ROLLBACK_REMOTE);
    ctx.effect(() => () => { void unmountRemote(); }, 'rollback remote teardown');
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'rollback dictionaries');
    ctx.slots.inject('conversation.chat.assistant-actions', () => {
        const dispose = ctx.slots.register({
            name: 'conversation.chat.assistant-actions',
            id: 'rollback',
            order: 20,
            locale: NS,
            inject: (sessionId) => ({
                prepare: messageId => ctx.remote.rollback.prepare(sessionId, messageId),
                execute: (messageId, request) => ctx.remote.rollback.execute({ sessionId, messageId, ...request }),
                openAt: (path, line) => ctx.remote.rollback.openAt(sessionId, path, line),
                forkAt: async (seq) => {
                    const childId = await sessions.fork({ sessionId, atSeq: seq, increaseTitle: true });
                    sessions.open(childId);
                    return childId;
                },
            }),
        }, RollbackAction);
        return dispose;
    });
    return async () => {
        await unmountRemote();
    };
}
