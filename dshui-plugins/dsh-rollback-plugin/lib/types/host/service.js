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
import { ChangeLedger } from "./ledger.js";
import { RollbackRestore } from "./restore.js";
import { RollbackSafety } from "./safety.js";
import { SnapshotManager, changeLedgerRoot } from "./snapshot.js";
export const DEFAULT_ROLLBACK_CONFIG = {
    enabled: true,
    snapshotOnPreStep: true,
    ledgerMaxTextBytes: 256 * 1024,
    maxLedgerRecordsPerSession: 500,
    maxSnapshotsPerSession: 200,
    maxDiffHunksPerFile: 20,
    maxDiffBytesPerFile: 256 * 1024,
    restoreChunkSize: 64,
    guardRetentionMs: 30 * 24 * 60 * 60 * 1000,
    lockStaleMs: 10 * 60 * 1000,
    spawnTimeoutMs: 60 * 1000,
};
let RollbackService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _prepare_decorators;
    let _execute_decorators;
    let _openAt_decorators;
    let _status_decorators;
    return class RollbackService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _prepare_decorators = [Remote];
            _execute_decorators = [Remote];
            _openAt_decorators = [Remote];
            _status_decorators = [Remote];
            __esDecorate(this, null, _prepare_decorators, { kind: "method", name: "prepare", static: false, private: false, access: { has: obj => "prepare" in obj, get: obj => obj.prepare }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _execute_decorators, { kind: "method", name: "execute", static: false, private: false, access: { has: obj => "execute" in obj, get: obj => obj.execute }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _openAt_decorators, { kind: "method", name: "openAt", static: false, private: false, access: { has: obj => "openAt" in obj, get: obj => obj.openAt }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        host = __runInitializers(this, _instanceExtraInitializers);
        config;
        snapshots;
        ledger;
        safety;
        restore;
        constructor(ctx, config = {}) {
            super(ctx, 'rollback');
            this.host = ctx;
            this.config = { ...DEFAULT_ROLLBACK_CONFIG, ...config };
            const ledgerDir = changeLedgerRoot();
            this.snapshots = new SnapshotManager({
                maxSnapshotsPerSession: this.config.maxSnapshotsPerSession,
                ledgerDir,
                spawnTimeoutMs: this.config.spawnTimeoutMs,
                maxDiffHunksPerFile: this.config.maxDiffHunksPerFile,
                maxDiffBytesPerFile: this.config.maxDiffBytesPerFile,
                restoreChunkSize: this.config.restoreChunkSize,
            }, this.host);
            this.ledger = new ChangeLedger(this.host, {
                ledgerMaxTextBytes: this.config.ledgerMaxTextBytes,
                maxLedgerRecordsPerSession: this.config.maxLedgerRecordsPerSession,
            });
            this.safety = new RollbackSafety({
                lockStaleMs: this.config.lockStaleMs,
                guardRetentionMs: this.config.guardRetentionMs,
                ledgerDir,
                lockTimeoutMs: 10_000,
            });
            this.restore = new RollbackRestore(this.host, this.snapshots, this.ledger, this.safety, {
                maxDiffHunksPerFile: this.config.maxDiffHunksPerFile,
                maxDiffBytesPerFile: this.config.maxDiffBytesPerFile,
                restoreChunkSize: this.config.restoreChunkSize,
                spawnTimeoutMs: this.config.spawnTimeoutMs,
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
    };
})();
export { RollbackService };
