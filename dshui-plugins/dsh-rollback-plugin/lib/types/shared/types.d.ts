/** JSON-safe RPC vocabulary shared by the dsh-rollback-plugin host and client. */
export type RollbackScope = 'turn' | 'files' | 'modifications';
export type RollbackErrorCode = 'session-not-found' | 'session-not-live' | 'message-not-found' | 'turn-not-found' | 'turn-not-completed' | 'snapshot-unavailable' | 'snapshot-expired' | 'workspace-changed' | 'agent-running' | 'git-operation-in-progress' | 'lock-timeout' | 'path-not-in-snapshot' | 'verification-failed' | 'rollback-failed' | 'bridge-unavailable';
export interface RollbackFailure {
    code: RollbackErrorCode;
    message: string;
    sessionId?: string;
    messageId?: string;
    paths?: string[];
    detail?: string;
}
export type RollbackResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: RollbackFailure;
};
export interface RollbackPrepareRequest {
    sessionId: string;
    messageId: string;
}
export interface RollbackSnapshotInfo {
    id: string;
    turn: number;
    createdAt: number;
    degraded?: boolean;
}
export interface RollbackBoundaryInfo {
    targetTurn: number;
    forkAtSeq?: number;
    forkAvailable: boolean;
}
export interface RollbackHunk {
    oldText: string | null;
    newText: string;
    oldLine?: number;
    newLine?: number;
    endLine?: number;
    /** First changed line inside the hunk (after the context prefix), 1-based — anchors UI buttons on the change itself. */
    firstChangedOldLine?: number;
    firstChangedNewLine?: number;
}
export type RollbackFileStatus = 'modified' | 'deleted' | 'created' | 'typechange' | 'ignored' | 'binary' | 'nested-repo';
export interface RollbackToolCall {
    callId: string;
    toolName: string;
    turn: number;
    step: number;
    seq: number;
    hunks: RollbackHunk[];
}
export interface RollbackFileChange {
    path: string;
    absolutePath: string;
    status: RollbackFileStatus;
    source: 'git' | 'ledger';
    restorable: boolean;
    /** Session modification list: the file's current state matches an accept marker. */
    accepted?: boolean;
    createdAfterSnapshot?: boolean;
    binary?: boolean;
    truncated?: boolean;
    hunks?: RollbackHunk[];
    toolCalls?: RollbackToolCall[];
}
export type RollbackModificationRestorable = 'merge' | 'file-only' | 'unsupported';
export interface RollbackModification {
    modificationId: string;
    toolName: 'write' | 'edit';
    path: string;
    turn: number;
    step: number;
    seq: number;
    hunks: RollbackHunk[];
    restorable: RollbackModificationRestorable;
    /** Session modification list: this patch matches an accept marker. */
    accepted?: boolean;
    reason?: string;
    createdFile?: boolean;
    laterModificationIds?: string[];
}
export interface RollbackPrepareValue {
    prepareId: string;
    snapshot: RollbackSnapshotInfo;
    boundary: RollbackBoundaryInfo;
    changes: RollbackFileChange[];
    modifications: RollbackModification[];
    warnings: string[];
}
export type RollbackPrepareResult = RollbackResult<RollbackPrepareValue>;
export interface RollbackExecuteRequest {
    sessionId: string;
    /** Assistant-message anchor; exactly one of messageId/turn must be set. */
    messageId?: string;
    /** Turn anchor (unfinished-turn rollback, prepareTurn flows). */
    turn?: number;
    prepareId: string;
    confirmed: true;
    scope: RollbackScope;
    paths?: string[];
    modificationIds?: string[];
    createdPolicy?: 'keep' | 'delete';
}
export type RollbackPrepareTurnResult = RollbackPrepareResult;
export type RollbackModificationStatus = 'restored' | 'conflict' | 'unsupported' | 'failed';
export interface RollbackModificationResult {
    modificationId: string;
    path: string;
    status: RollbackModificationStatus;
    detail?: string;
}
export interface RollbackExecuteValue {
    guardId: string;
    restored: string[];
    kept: string[];
    deleted: string[];
    skipped: string[];
    modificationResults?: RollbackModificationResult[];
    forkAnchor?: number;
}
export type RollbackExecuteResult = RollbackResult<RollbackExecuteValue>;
export interface OpenAtRequest {
    sessionId: string;
    path: string;
    line?: number;
    endLine?: number;
}
export type OpenAtValue = {
    opened: true;
} | {
    opened: false;
    reason: 'bridge-unavailable' | 'invalid-path';
};
export type OpenAtResult = RollbackResult<OpenAtValue>;
export type RollbackJournalPhase = 'running' | 'completed' | 'rolled-back' | 'interrupted';
export interface RollbackJournalEntry {
    id: string;
    phase: RollbackJournalPhase;
    paths: string[];
    guardId?: string;
    createdAt: number;
    updatedAt: number;
}
export interface RollbackLockInfo {
    ownerPid: number;
    nonce: string;
    createdAt: number;
}
export interface RollbackStatusValue {
    journal: RollbackJournalEntry[];
    lock?: RollbackLockInfo;
}
export type RollbackStatusResult = RollbackResult<RollbackStatusValue>;
/** Host-only persisted snapshot manifest. */
export interface RollbackSnapshotManifest {
    snapshotId: string;
    sessionId: string;
    turn: number;
    cwd: string;
    tree?: string;
    head?: string;
    createdAt: number;
    turnStartSeq?: number;
    mode: 'git' | 'ledger';
}
/** Host-only guard record. */
export interface RollbackGuardRecord {
    guardId: string;
    cwd: string;
    tree?: string;
    ledgerFiles: RollbackGuardFile[];
    createdAt: number;
}
export interface RollbackGuardFile {
    path: string;
    existed: boolean;
    version?: string;
    size?: number;
    content?: string;
}
/** How the accepted state of a file was fingerprinted at accept time. */
export type RollbackAcceptFingerprint = {
    kind: 'content';
    hash: string;
} | {
    kind: 'stat';
    version?: string;
    size?: number;
    mtimeMs?: number;
};
/** Baseline the session modification list diffs against (earliest session snapshot). */
export interface RollbackSessionBaseline {
    turn: number;
    createdAt: number;
    mode: 'git' | 'ledger';
    degraded?: boolean;
}
export interface RollbackSessionChangesValue {
    /** Binds this list to the worktree state captured while listing. */
    listId: string;
    baseline?: RollbackSessionBaseline;
    changes: RollbackFileChange[];
    modifications: RollbackModification[];
    acceptedFiles: string[];
    acceptedModifications: string[];
    warnings: string[];
}
export type RollbackSessionChangesResult = RollbackResult<RollbackSessionChangesValue>;
export interface RollbackAcceptFileRequest {
    sessionId: string;
    path: string;
    listId: string;
}
export interface RollbackAcceptModificationRequest {
    sessionId: string;
    modificationId: string;
    /** Workspace-relative path of the patch's file (for the all-accepted cascade). */
    path: string;
    listId: string;
}
export interface RollbackAcceptValue {
    acceptedFiles: string[];
    acceptedModifications: string[];
}
export type RollbackAcceptResult = RollbackResult<RollbackAcceptValue>;
export interface RollbackUndoFileRequest {
    sessionId: string;
    path: string;
    listId: string;
}
export interface RollbackUndoFileValue {
    guardId: string;
    restored: string[];
    deleted: string[];
    kept: string[];
    skipped: string[];
    /** The undone file is auto-accepted, so it leaves the default list view. */
    acceptedFiles: string[];
}
export type RollbackUndoFileResult = RollbackResult<RollbackUndoFileValue>;
export interface RollbackUndoModificationRequest {
    sessionId: string;
    modificationId: string;
    listId: string;
}
export interface RollbackUndoModificationValue {
    guardId: string;
    modificationResults: RollbackModificationResult[];
    acceptedModifications: string[];
}
export type RollbackUndoModificationResult = RollbackResult<RollbackUndoModificationValue>;
export interface RollbackAcceptAllRequest {
    sessionId: string;
    listId: string;
}
export type RollbackAcceptAllResult = RollbackResult<RollbackAcceptValue>;
export interface RollbackUndoAllRequest {
    sessionId: string;
    listId: string;
}
/** Whole-list undo reuses the per-file undo value shape. */
export type RollbackUndoAllResult = RollbackResult<RollbackUndoFileValue>;
