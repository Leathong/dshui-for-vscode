/**
 * dsh-workspace-scope — Host half.
 *
 * Workspace config is locked on the first real Agent prompt assembly. MCP
 * restrictions are reconciled before the authoritative assembly reaches the
 * model; Skill shadows are refreshed immediately before DSH's skill catalog.
 */
import type { Context } from "@deepseek-ai/cordis";
export declare const name = "dsh-workspace-scope";
export declare const inject: string[];
type ScopeMode = "default" | "whitelist" | "blacklist";
interface ScopeConfig {
    mode: ScopeMode;
    skills: string[];
    mcps: string[];
}
export declare function parseScopeConfig(text: string | undefined): ScopeConfig;
export declare function deniedServers(cfg: ScopeConfig, allServers: string[]): string[];
export declare function deniedSkills(cfg: ScopeConfig, allSkills: string[]): string[];
export declare function apply(ctx: Context): void;
export {};
