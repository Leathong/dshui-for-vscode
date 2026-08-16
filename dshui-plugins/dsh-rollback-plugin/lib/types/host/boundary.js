export function resolveBoundary(session, messageId) {
    let assistant;
    for (const event of session.events) {
        if (event.type !== 'assistant/message')
            continue;
        const message = event.data.message;
        if (message.id === messageId)
            assistant = event;
    }
    if (assistant === undefined) {
        return {
            failure: {
                code: 'message-not-found',
                message: `assistant message "${messageId}" was not found in session "${session.id}"`,
                sessionId: session.id,
                messageId,
            },
        };
    }
    return resolveForTurn(session, assistant.data.turn, { assistantEvent: assistant });
}
/**
 * Resolve the rollback boundary of a turn by its number. Works for unfinished
 * turns (a stopped/interrupted assistant message never emits `turn/end`): the
 * rollback target is the turn-start snapshot and the fork anchor is the last
 * completed turn end before it.
 */
export function resolveBoundaryForTurn(session, turn) {
    const turnStart = session.events.find(event => event.type === 'turn/start' && event.data.turn === turn);
    if (turnStart === undefined) {
        return {
            failure: {
                code: 'turn-not-found',
                message: `turn ${turn} has no turn/start in session "${session.id}"`,
                sessionId: session.id,
            },
        };
    }
    return resolveForTurn(session, turn, { turnStartSeq: turnStart.seq });
}
function resolveForTurn(session, targetTurn, extras) {
    const turnStart = session.events.find(event => event.type === 'turn/start' && event.data.turn === targetTurn);
    const anchor = findPreviousTurnEnd(session.events, turnStart?.seq ?? Number.MAX_SAFE_INTEGER);
    return {
        boundary: {
            targetTurn,
            ...(anchor === undefined ? {} : { forkAtSeq: anchor.seq }),
            forkAvailable: anchor !== undefined,
            ...extras,
            ...(turnStart === undefined ? {} : { turnStartSeq: turnStart.seq }),
        },
    };
}
export function findPreviousTurnEnd(events, beforeSeq) {
    let found;
    for (const event of events) {
        if (event.seq >= beforeSeq)
            break;
        if (event.type === 'turn/end')
            found = event;
    }
    return found;
}
export function boundaryInfo(boundary) {
    return {
        targetTurn: boundary.targetTurn,
        ...(boundary.forkAtSeq === undefined ? {} : { forkAtSeq: boundary.forkAtSeq }),
        forkAvailable: boundary.forkAvailable,
    };
}
