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
    /** File-kind only: bounded text content at accept time — the diff baseline
     *  for later changes, so a re-appearing file only shows post-accept edits. */
    content?: string;
    createdAt: number;
}
export interface AcceptLedgerOptions {
    /** Cap on persisted records per session; oldest records are trimmed first. */
    maxAcceptRecordsPerSession?: number;
    /** Override the persistence file (tests and tooling). */
    acceptsFile?: string;
    /** Cap on stored accept-time content (bytes); oversized files keep only the fingerprint. */
    maxContentBytes?: number;
}
/** Default cap on stored accept-time content; matches the ledger text bound. */
export declare const DEFAULT_ACCEPT_CONTENT_MAX_BYTES: number;
export declare function acceptsPath(): string;
export declare class AcceptLedger {
    private readonly options;
    private readonly records;
    private loaded;
    private writeTail;
    private readonly maxPerSession;
    private readonly maxContentBytes;
    private readonly file;
    constructor(options?: AcceptLedgerOptions);
    private load;
    private upsert;
    private persist;
    acceptFile(sessionId: string, filePath: string, fingerprint?: RollbackAcceptFingerprint, content?: string): void;
    acceptModification(sessionId: string, modificationId: string): void;
    /** File accept record; cheap existence/identity check before fingerprinting the file. */
    fileRecord(sessionId: string, filePath: string): AcceptRecord | undefined;
    fileAccepted(sessionId: string, filePath: string, fingerprint?: RollbackAcceptFingerprint): boolean;
    /** Bounded text content captured at accept time (diff baseline for later changes). */
    acceptedContent(sessionId: string, filePath: string): string | undefined;
    modificationAccepted(sessionId: string, modificationId: string): boolean;
    acceptedFiles(sessionId: string): string[];
    acceptedModifications(sessionId: string): string[];
    list(sessionId?: string): readonly AcceptRecord[];
    /** Await pending persistence (tests and graceful shutdown paths). */
    flush(): Promise<void>;
}
