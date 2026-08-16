import type { Context } from '@deepseek-ai/cordis';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
export declare const inject: string[];
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
export type { RemoteResult };
