var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { AcceptBase } from "./accept-base.js";
import { RollbackRestore } from "./restore.js";
import { RollbackSafety } from "./safety.js";
import { SessionChangeManager } from "./session-changes.js";
import { SnapshotManager, changeLedgerRoot } from "./snapshot.js";
import { CallTracker } from "./tracking.js";
export const DEFAULT_ROLLBACK_CONFIG = {
    enabled: true,
    snapshotOnPreStep: true,
    maxSnapshotsPerSession: 200,
    maxDiffHunksPerFile: 20,
    maxDiffBytesPerFile: 256 * 1024,
    restoreChunkSize: 64,
    guardRetentionMs: 30 * 24 * 60 * 60 * 1000,
    lockStaleMs: 10 * 60 * 1000,
    spawnTimeoutMs: 60 * 1000,
    trackingEnabled: true,
    maxBlobBytes: 8 * 1024 * 1024,
    maxTrackedCallsPerSession: 500,
    diffContextLines: 3,
};
let RollbackService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _prepare_decorators;
    let _execute_decorators;
    let _openAt_decorators;
    let _status_decorators;
    let _prepareTurn_decorators;
    let _sessionChanges_decorators;
    let _acceptAll_decorators;
    let _acceptFile_decorators;
    let _acceptModification_decorators;
    let _undoAll_decorators;
    let _undoFile_decorators;
    let _undoModification_decorators;
    let _undoHunks_decorators;
    return class RollbackService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _prepare_decorators = [Remote];
            _execute_decorators = [Remote];
            _openAt_decorators = [Remote];
            _status_decorators = [Remote];
            _prepareTurn_decorators = [Remote];
            _sessionChanges_decorators = [Remote];
            _acceptAll_decorators = [Remote];
            _acceptFile_decorators = [Remote];
            _acceptModification_decorators = [Remote];
            _undoAll_decorators = [Remote];
            _undoFile_decorators = [Remote];
            _undoModification_decorators = [Remote];
            _undoHunks_decorators = [Remote];
            __esDecorate(this, null, _prepare_decorators, { kind: "method", name: "prepare", static: false, private: false, access: { has: obj => "prepare" in obj, get: obj => obj.prepare }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _execute_decorators, { kind: "method", name: "execute", static: false, private: false, access: { has: obj => "execute" in obj, get: obj => obj.execute }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _openAt_decorators, { kind: "method", name: "openAt", static: false, private: false, access: { has: obj => "openAt" in obj, get: obj => obj.openAt }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _prepareTurn_decorators, { kind: "method", name: "prepareTurn", static: false, private: false, access: { has: obj => "prepareTurn" in obj, get: obj => obj.prepareTurn }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _sessionChanges_decorators, { kind: "method", name: "sessionChanges", static: false, private: false, access: { has: obj => "sessionChanges" in obj, get: obj => obj.sessionChanges }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _acceptAll_decorators, { kind: "method", name: "acceptAll", static: false, private: false, access: { has: obj => "acceptAll" in obj, get: obj => obj.acceptAll }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _acceptFile_decorators, { kind: "method", name: "acceptFile", static: false, private: false, access: { has: obj => "acceptFile" in obj, get: obj => obj.acceptFile }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _acceptModification_decorators, { kind: "method", name: "acceptModification", static: false, private: false, access: { has: obj => "acceptModification" in obj, get: obj => obj.acceptModification }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _undoAll_decorators, { kind: "method", name: "undoAll", static: false, private: false, access: { has: obj => "undoAll" in obj, get: obj => obj.undoAll }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _undoFile_decorators, { kind: "method", name: "undoFile", static: false, private: false, access: { has: obj => "undoFile" in obj, get: obj => obj.undoFile }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _undoModification_decorators, { kind: "method", name: "undoModification", static: false, private: false, access: { has: obj => "undoModification" in obj, get: obj => obj.undoModification }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _undoHunks_decorators, { kind: "method", name: "undoHunks", static: false, private: false, access: { has: obj => "undoHunks" in obj, get: obj => obj.undoHunks }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        host = __runInitializers(this, _instanceExtraInitializers);
        config;
        snapshots;
        safety;
        acceptBase;
        restore;
        sessionChangeManager;
        tracker;
        constructor(ctx, config = {}) {
            super(ctx, 'rollback');
            this.host = ctx;
            this.config = { ...DEFAULT_ROLLBACK_CONFIG, ...config };
            // `change-ledger` still hosts the cross-process workspace lock directory.
            const ledgerDir = changeLedgerRoot();
            this.snapshots = new SnapshotManager({
                maxSnapshotsPerSession: this.config.maxSnapshotsPerSession,
                ledgerDir,
                spawnTimeoutMs: this.config.spawnTimeoutMs,
                maxDiffHunksPerFile: this.config.maxDiffHunksPerFile,
                maxDiffBytesPerFile: this.config.maxDiffBytesPerFile,
                restoreChunkSize: this.config.restoreChunkSize,
            }, this.host);
            this.safety = new RollbackSafety({
                lockStaleMs: this.config.lockStaleMs,
                guardRetentionMs: this.config.guardRetentionMs,
                lockTimeoutMs: 10_000,
            });
            this.acceptBase = new AcceptBase(this.host, this.snapshots, { spawnTimeoutMs: this.config.spawnTimeoutMs });
            this.tracker = new CallTracker(this.host, this.snapshots, {
                maxBlobBytes: this.config.maxBlobBytes,
                maxCallsPerSession: this.config.maxTrackedCallsPerSession,
            });
            this.restore = new RollbackRestore(this.host, this.snapshots, this.tracker, this.safety, {
                maxDiffHunksPerFile: this.config.maxDiffHunksPerFile,
                maxDiffBytesPerFile: this.config.maxDiffBytesPerFile,
                restoreChunkSize: this.config.restoreChunkSize,
                spawnTimeoutMs: this.config.spawnTimeoutMs,
            });
            this.sessionChangeManager = new SessionChangeManager(this.host, this.snapshots, this.tracker, this.acceptBase, this.safety, {
                maxDiffHunksPerFile: this.config.maxDiffHunksPerFile,
                maxDiffBytesPerFile: this.config.maxDiffBytesPerFile,
                spawnTimeoutMs: this.config.spawnTimeoutMs,
                diffContextLines: this.config.diffContextLines,
            });
        }
        prepare(sessionId, messageId, _signal) {
            return this.restore.prepare(sessionId, messageId);
        }
        execute(request, _signal) {
            return this.restore.execute(request);
        }
        openAt(sessionId, path, line, _signal) {
            return this.restore.openAt(sessionId, { sessionId, path, ...(line === undefined ? {} : { line }) });
        }
        status(sessionId, _signal) {
            return this.restore.status(sessionId);
        }
        prepareTurn(sessionId, turn, _signal) {
            return this.restore.prepareTurn(sessionId, turn);
        }
        sessionChanges(sessionId, _signal) {
            return this.sessionChangeManager.sessionChanges(sessionId);
        }
        acceptAll(request, _signal) {
            return this.sessionChangeManager.acceptAll(request);
        }
        acceptFile(request, _signal) {
            return this.sessionChangeManager.acceptFile(request);
        }
        acceptModification(request, _signal) {
            return this.sessionChangeManager.acceptModification(request);
        }
        undoAll(request, _signal) {
            return this.sessionChangeManager.undoAll(request);
        }
        undoFile(request, _signal) {
            return this.sessionChangeManager.undoFile(request);
        }
        undoModification(request, _signal) {
            return this.sessionChangeManager.undoModification(request);
        }
        undoHunks(request, _signal) {
            return this.sessionChangeManager.undoHunks(request);
        }
    };
})();
export { RollbackService };
