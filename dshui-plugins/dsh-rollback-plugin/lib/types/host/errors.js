export function ok(value) {
    return { ok: true, value };
}
export function fail(code, message, fields = {}) {
    return { ok: false, error: { code, message, ...fields } };
}
export function isRollbackFailure(value) {
    return typeof value === 'object' && value !== null && value.ok === false;
}
