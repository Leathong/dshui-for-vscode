import type { RollbackAcceptFingerprint } from '../shared/types.ts';
/**
 * Session modification-list accept markers. Accepting a file records the
 * current content fingerprint; the file stays out of the default list view
 * until its content (or stat identity) changes again. Accepting a patch
 * records its modificationId; the caller cascades a file-level accept once
 * every patch of a file is accepted.
 */
export interface AcceptRecord {
    sessionId: string;
    kind: 'file' | 'modification';
    /** File: workspace-relative path. Modification: ledger modificationId. */
    key: string;
    /** File-kind only: state identity captured at accept time. */
    fingerprint?: RollbackAcceptFingerprint;
    createdAt: number;
}
export interface AcceptLedgerOptions {
    /** Cap on persisted records per session; oldest records are trimmed first. */
    maxAcceptRecordsPerSession?: number;
    /** Override the persistence file (tests and tooling). */
    acceptsFile?: string;
}
export declare function acceptsPath(): string;
export declare class AcceptLedger {
    private readonly options;
    private readonly records;
    private loaded;
    private writeTail;
    private readonly maxPerSession;
    private readonly file;
    constructor(options?: AcceptLedgerOptions);
    private load;
    private upsert;
    private persist;
    acceptFile(sessionId: string, filePath: string, fingerprint?: RollbackAcceptFingerprint): void;
    acceptModification(sessionId: string, modificationId: string): void;
    fileAccepted(sessionId: string, filePath: string, fingerprint?: RollbackAcceptFingerprint): boolean;
    modificationAccepted(sessionId: string, modificationId: string): boolean;
    acceptedFiles(sessionId: string): string[];
    acceptedModifications(sessionId: string): string[];
    list(sessionId?: string): readonly AcceptRecord[];
    /** Await pending persistence (tests and graceful shutdown paths). */
    flush(): Promise<void>;
}
