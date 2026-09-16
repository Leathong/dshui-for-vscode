import type { Context } from '@deepseek-ai/cordis';
import { RollbackService } from './service.ts';
import type { RollbackHostConfig } from './service.ts';
export declare const name = "rollback";
export declare const inject: string[];
export interface RollbackPluginOptions extends Partial<RollbackHostConfig> {
}
export declare function apply(ctx: Context, options?: RollbackPluginOptions): void;
/**
 * Per-call tracking listens to `fs/observed` only: the git-native model needs
 * no before-image, so the write/edit *intent* hooks (and their synchronous
 * whole-file read on the tool critical path) are gone.
 */
export declare function installTrackingListeners(ctx: Context, service: RollbackService): void;
