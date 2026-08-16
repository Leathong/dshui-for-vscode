import type { Context } from '@deepseek-ai/cordis';
import { RollbackService } from './service.ts';
import type { RollbackHostConfig } from './service.ts';
export declare const name = "rollback";
export declare const inject: string[];
export interface RollbackPluginOptions extends Partial<RollbackHostConfig> {
}
export declare function apply(ctx: Context, options?: RollbackPluginOptions): void;
export declare function installLedgerListeners(ctx: Context, service: RollbackService): void;
