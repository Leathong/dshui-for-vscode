/**
 * dsh-client-ui-whitelist, node half. The host behavior is a no-op: this
 * package exists to carry the browser bundle (settings-page section for the
 * sandbox whitelist). The section edits the `sandbox-whitelist:` settings
 * document section only — the authoritative security guard stays in the
 * host-side dsh-whitelist-sandbox plugin, so the UI can never bypass it.
 */
export const name = "dsh-client-ui-whitelist"

export function apply() {}
