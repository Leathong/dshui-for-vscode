import type { Context } from '@deepseek-ai/cordis';
import type { LayeredOverrides } from '../shared/types.ts';
export type CapabilityGateDecision = {
    readonly action: 'deny';
    readonly reason: string;
} | {
    readonly action: 'pass';
};
export declare function evaluateCapabilityGate(readLayered: () => LayeredOverrides, exec: {
    readonly name?: unknown;
    readonly arguments?: unknown;
} | null | undefined): CapabilityGateDecision;
export declare function applyCapabilityGate(scopedCtx: Context, readLayered: () => LayeredOverrides): () => void;
