import type { ReactElement } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionEventSource, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { OpenAtResult, RollbackAcceptResult, RollbackSessionChangesResult, RollbackUndoFileResult, RollbackUndoHunksResult, RollbackUndoModificationResult } from '../shared/types.ts';
export interface ModificationDockInjected {
    sessionChanges: () => Promise<RemoteResult<RollbackSessionChangesResult>>;
    /**
     * Explicit refresh: the host captures the worktree first when a turn is
     * running (so bash/script-created files appear immediately), then lists.
     */
    refreshChanges: () => Promise<RemoteResult<RollbackSessionChangesResult>>;
    acceptAll: (listId: string) => Promise<RemoteResult<RollbackAcceptResult>>;
    undoAll: (listId: string) => Promise<RemoteResult<RollbackUndoFileResult>>;
    acceptFile: (path: string, listId: string) => Promise<RemoteResult<RollbackAcceptResult>>;
    acceptModification: (modificationId: string, path: string, listId: string) => Promise<RemoteResult<RollbackAcceptResult>>;
    undoFile: (path: string, listId: string) => Promise<RemoteResult<RollbackUndoFileResult>>;
    undoModification: (modificationId: string, listId: string) => Promise<RemoteResult<RollbackUndoModificationResult>>;
    /** Undo single hunks of one file (forward complement, no reverse patch). */
    undoHunks: (path: string, hunks: number[], listId: string) => Promise<RemoteResult<RollbackUndoHunksResult>>;
    openAt: (path: string, line?: number) => Promise<RemoteResult<OpenAtResult>>;
    /**
     * Live session event window. The host appends session events (turns, tool
     * results) to it as they happen, so the dock refreshes on top of actual
     * modification activity instead of a polling cadence. Absent when the
     * session is not currently bound.
     */
    sessionEvents?: SessionEventSource;
}
export interface ModificationDockProps extends ModificationDockInjected {
    session: SessionSnapshot;
    t: TranslateNS<'rollback'>;
}
/**
 * Every tooltip below passes `portal` on purpose. Since dsh 0.2.2 the composer
 * seat is a fixed-position containing block (`will-change: transform`), so a
 * non-portaled `position: fixed` bubble would keep viewport-derived left/top
 * but be laid out in seat coordinates. That overflow expands the transcript
 * scroll area, which moves the sticky composer under the pointer; hover then
 * repeatedly shows/hides the bubble and the page flickers. The upstream
 * composer controls (`InputBar`, `QueueDock`) portal for the same reason.
 */
export declare function ModificationDock(props: ModificationDockProps): ReactElement | null;
