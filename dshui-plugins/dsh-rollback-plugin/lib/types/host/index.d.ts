import type { Context } from '@deepseek-ai/cordis';
import { RollbackService } from './service.ts';
import type { RollbackHostConfig } from './service.ts';
export declare const name = "rollback";
export declare const inject: string[];
export interface RollbackPluginOptions extends Partial<RollbackHostConfig> {
}
export declare function apply(ctx: Context, options?: RollbackPluginOptions): void;
/**
 * Per-call tracking listens to `fs/observed` for the post-image and to the
 * write/edit *intents* for session-start pre-images.
 *
 * The intent hooks are prepended and transparent: they capture only the first
 * touch of a path the chain base tree cannot see (ignored files, excluded
 * nested paths) and then call `next()`, so the observation-policy guard — a
 * single-slot decision that does not call `next()` itself — is preserved.
 * Tracked files are an in-memory set lookup, which keeps the tool critical
 * path free of whole-file reads for the normal case.
 */
export declare function installTrackingListeners(ctx: Context, service: RollbackService): void;
