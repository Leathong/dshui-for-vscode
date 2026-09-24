/**
 * Same-origin HTTP client for the composer panel. Two thin wrappers over the
 * Host's read/write routes (see host/http.ts): both resolve to the refreshed
 * projection, or `null` on any transport or Host error so the caller can fall
 * back to the "unavailable" panel state without a try/catch at the call site.
 *
 * @module dsh-capability-toggle-plugin/client/api
 */
/** URL prefix the Host claims (mirrors host/http.ts ROUTE_PREFIX). */
const API = '/api/plugin/capability-toggle';
/** Fetch one session's projection; null on any transport or Host error. */
export async function fetchState(session) {
    try {
        const res = await fetch(`${API}/state?session=${encodeURIComponent(session)}`, {
            headers: { accept: 'application/json' },
        });
        if (!res.ok)
            return null;
        const body = (await res.json());
        // Normalize a missing/undefined `projection` to null. Callers branch on
        // `projection === null`; an undefined would slip past that check and reach
        // `projection.rows` (a TypeError that blanks the whole composer control).
        return body.projection ?? null;
    }
    catch {
        return null;
    }
}
/** Write one stance; returns the refreshed projection, or null on failure. */
export async function writeState(req) {
    try {
        const res = await fetch(`${API}/set`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok)
            return null;
        const body = (await res.json());
        return body.projection ?? null;
    }
    catch {
        return null;
    }
}
/** Write one stance to every listed id; returns the refreshed projection, or null on failure. */
export async function writeStateMany(req) {
    try {
        const res = await fetch(`${API}/set-many`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok)
            return null;
        const body = (await res.json());
        return body.projection ?? null;
    }
    catch {
        return null;
    }
}
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function parseConfirmCard(value) {
    if (!isRecord(value) || 'snapshot' in value || 'resolved' in value)
        return null;
    const { id, guardId, guardAction, reason, toolName, detail } = value;
    if (typeof id !== 'string' || id === '' || typeof guardId !== 'string' || guardId === ''
        || (guardAction !== 'deny' && guardAction !== 'ask') || typeof reason !== 'string'
        || typeof toolName !== 'string' || typeof detail !== 'string')
        return null;
    return { id, guardId, guardAction, reason, toolName, detail };
}
function parseConfirmPush(value) {
    if (!isRecord(value))
        return null;
    if ('snapshot' in value) {
        if (!Array.isArray(value.snapshot) || 'id' in value || 'resolved' in value)
            return null;
        const cards = [];
        const ids = new Set();
        for (const entry of value.snapshot) {
            const card = parseConfirmCard(entry);
            if (card === null || ids.has(card.id))
                return null;
            ids.add(card.id);
            cards.push(card);
        }
        return { kind: 'snapshot', cards };
    }
    if ('resolved' in value) {
        return value.resolved === true && typeof value.id === 'string' && value.id !== ''
            ? { kind: 'resolved', id: value.id }
            : null;
    }
    const card = parseConfirmCard(value);
    return card === null ? null : { kind: 'pending', card };
}
export function subscribeConfirm(session, onPush) {
    if (session === '')
        return () => { };
    const url = `${API}/confirm/stream?session=${encodeURIComponent(session)}`;
    const es = new EventSource(url);
    let active = true;
    es.onmessage = (ev) => {
        if (!active || typeof ev.data !== 'string')
            return;
        let parsed;
        try {
            parsed = JSON.parse(ev.data);
        }
        catch {
            return;
        }
        const push = parseConfirmPush(parsed);
        if (push !== null)
            onPush(push);
    };
    return () => { active = false; es.onmessage = null; es.close(); };
}
export async function respondConfirm(session, id, decision) {
    try {
        const res = await fetch(`${API}/confirm/respond`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ session, id, decision }),
        });
        if (res.status === 410)
            return 'gone';
        return res.ok ? 'accepted' : 'retry';
    }
    catch {
        return 'retry';
    }
}
