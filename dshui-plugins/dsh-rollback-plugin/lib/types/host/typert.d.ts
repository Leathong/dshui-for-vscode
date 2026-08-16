import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol';
export declare const ROLLBACK_PACKAGE = "dsh-rollback-plugin";
/** Hand-written Host Typert contribution with strict JSON codecs. */
export declare const ROLLBACK_HOST_TYPERT: TypertContribution;
/** Consumer-side Remote contribution mounted by the client bundle. */
export declare const ROLLBACK_REMOTE: {
    package: string;
    descriptors: readonly InvocationDescriptor[];
};
