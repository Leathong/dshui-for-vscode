import type { TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
/**
 * Strict JSON codec used by the hand-written rollback Remote contribution.
 *
 * `dsh-api-gateway` requires every generated Remote parameter and result to
 * carry a `strict` codec; the Host boundary additionally re-validates that
 * the decoded value is JSON-safe. Business validation stays in the service
 * methods, so this codec intentionally performs the identity transform.
 */
export declare function jsonCodec(typeSymbol: string): Extract<TypertCodec, {
    mode: 'strict';
}>;
export declare const JSON_TYPE_SYMBOL = "dsh-rollback-plugin/types#JsonValue";
