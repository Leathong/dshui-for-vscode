import type { Context } from '@deepseek-ai/cordis';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'conversation.chat.user-actions': {
            kind: 'list';
            scope: 'session';
            owner: {
                turn: TurnLocation;
            };
        };
    }
}
export declare const inject: string[];
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
export type { RemoteResult };
