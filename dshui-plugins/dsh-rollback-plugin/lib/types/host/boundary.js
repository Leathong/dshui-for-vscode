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
    const targetTurn = assistant.data.turn;
    const turnEnd = session.events.find(event => event.type === 'turn/end' && event.data.turn === targetTurn);
    if (turnEnd === undefined) {
        return {
            failure: {
                code: 'turn-not-completed',
                message: `turn ${targetTurn} has not completed yet`,
                sessionId: session.id,
                messageId,
            },
        };
    }
    const turnStart = session.events.find(event => event.type === 'turn/start' && event.data.turn === targetTurn);
    const anchor = findPreviousTurnEnd(session.events, turnStart?.seq ?? assistant.seq);
    return {
        boundary: {
            targetTurn,
            ...(anchor === undefined ? {} : { forkAtSeq: anchor.seq }),
            forkAvailable: anchor !== undefined,
            assistantEvent: assistant,
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
