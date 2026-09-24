/**
 * Host (Node) half of dsh-capability-toggle-plugin.
 *
 * Lets a user switch off individual skills, MCP server groups, and plain tools
 * at three levels — session, project, and global — from a panel in the composer
 * tool row. A switched-off capability disappears from the model's tool schema
 * set / skill catalog on the next agent step and is hard-refused if the model
 * still attempts it, so the effect is enforced, not merely hidden.
 *
 * Composition:
 *   - OverrideStore        durable three-level state in one storage domain.
 *   - ControllerRegistry   per-agent enforcement on the tool and skill seams.
 *   - installHttp          the browser panel's read/write channel.
 *
 * Enforcement is re-applied whenever the store commits (any level, any client)
 * and whenever an agent starts; it is dropped when an agent is disposed.
 *
 * @module dsh-capability-toggle-plugin
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "dsh-capability-toggle-plugin";
/**
 * Required services. `storageDomain` backs the durable state, `tools` and
 * `skills` are the enforced seams, `systemPrompt` carries the tool-guidance
 * section shadow that accompanies a disabled tool, `webServer` carries the
 * browser panel channel, and `connection` carries the per-request auth seam the
 * panel routes apply themselves.
 */
export declare const inject: string[];
/**
 * Host plugin body. Every contribution is an effect, so plugin unload (or HMR
 * hot-swap) tears down the routes, the domain, and every per-agent application.
 * The domain is opened BEFORE any listener is installed: a binding created
 * against a not-yet-open domain would read empty overrides and fail open.
 * @param ctx - the Host root context.
 */
export declare function apply(ctx: Context): Promise<void>;
