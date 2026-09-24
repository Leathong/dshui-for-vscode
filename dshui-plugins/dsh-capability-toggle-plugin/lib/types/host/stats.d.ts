import type { Context } from '@deepseek-ai/cordis';
export declare function applyCallStats(scopedCtx: Context, onCall: (id: string) => void): () => void;
