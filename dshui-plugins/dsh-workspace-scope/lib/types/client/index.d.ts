/**
 * dsh-workspace-scope — Client half (TSX).
 *
 * 按工作区（工程）启停 Skill 与 Host 全局 MCP。入口只在新建会话界面（hero）：
 * 输入卡右侧工具行（conversation.input.right）的紧凑 chip；已进行的
 * 对话不显示入口（配置在会话开始时锁定，修改只影响该工作区的新对话）。
 * 弹窗样式参考「设置 → 插件」页（搜索框 + 分组计数 + 卡片网格）。
 * Skill 与 Host 全局 MCP 全部可管理条目始终展示，勾选即启用（白名单语义），
 * 提供 全部启用 / 全部禁用 快捷按钮，改动即时保存。配置只影响新对话开场。
 *
 * 数据通道双环境：随扩展分发静态 bundle 走 /api/dsh-workspace-scope 路由；
 * 保留 `host` 分支以兼容旧动态（plugin-dev-loop）沙箱测试环境。
 *
 * @module dsh-workspace-scope/client
 */
import type { Context } from "@deepseek-ai/cordis";
export declare const name = "workspace-scope-client";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
