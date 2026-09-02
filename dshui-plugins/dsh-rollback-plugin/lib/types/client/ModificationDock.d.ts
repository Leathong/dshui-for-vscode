import type { ReactElement } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionEventSource, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { OpenAtResult, RollbackAcceptResult, RollbackSessionChangesResult, RollbackUndoFileResult, RollbackUndoModificationResult } from '../shared/types.ts';
export interface ModificationDockInjected {
    sessionChanges: () => Promise<RemoteResult<RollbackSessionChangesResult>>;
    acceptAll: (listId: string) => Promise<RemoteResult<RollbackAcceptResult>>;
    undoAll: (listId: string) => Promise<RemoteResult<RollbackUndoFileResult>>;
    acceptFile: (path: string, listId: string) => Promise<RemoteResult<RollbackAcceptResult>>;
    acceptModification: (modificationId: string, path: string, listId: string) => Promise<RemoteResult<RollbackAcceptResult>>;
    undoFile: (path: string, listId: string) => Promise<RemoteResult<RollbackUndoFileResult>>;
    undoModification: (modificationId: string, listId: string) => Promise<RemoteResult<RollbackUndoModificationResult>>;
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
export declare function ModificationDock(props: ModificationDockProps): ReactElement | null;
