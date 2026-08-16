/**
 * Strict JSON codec used by the hand-written rollback Remote contribution.
 *
 * `dsh-api-gateway` requires every generated Remote parameter and result to
 * carry a `strict` codec; the Host boundary additionally re-validates that
 * the decoded value is JSON-safe. Business validation stays in the service
 * methods, so this codec intentionally performs the identity transform.
 */
export function jsonCodec(typeSymbol) {
    return {
        mode: 'strict',
        typeSymbol,
        schema: {
            parse(value) {
                return value;
            },
        },
    };
}
export const JSON_TYPE_SYMBOL = 'dsh-rollback-plugin/types#JsonValue';
