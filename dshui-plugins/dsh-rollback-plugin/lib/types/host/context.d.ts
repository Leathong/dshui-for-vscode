import type { Session, SessionEvent, SessionId, SessionStore } from '@deepseek-ai/dsh-session';
import type { Agent, AgentRegistry } from '@deepseek-ai/dsh-agent';
import type { FileSystem, FsInfo, FsObservation, FsTarget, FsVersion } from '@deepseek-ai/dsh-fs';
/** Structural view of the Host Context this bundle consumes. */
export interface RollbackCordisContext {
    readonly logger: {
        warn(message: string, ...args: unknown[]): void;
        error(message: string, ...args: unknown[]): void;
        info?(message: string, ...args: unknown[]): void;
    };
    readonly sessions: SessionStore;
    readonly agents: AgentRegistry;
    readonly fs: FileSystem;
    readonly get: (key: string) => unknown;
    readonly effect: (callback: () => (() => void) | void, label?: string) => () => void;
    on(event: 'agent/pre-step', listener: RollbackPreStepListener, options?: {
        prepend?: boolean;
    }): () => void;
    on(event: 'fs/write-intent', listener: RollbackWriteIntentListener, options?: {
        prepend?: boolean;
    }): () => void;
    on(event: 'fs/edit-intent', listener: RollbackEditIntentListener, options?: {
        prepend?: boolean;
    }): () => void;
    on(event: 'fs/observed', listener: RollbackObservedListener, options?: {
        prepend?: boolean;
    }): () => void;
}
export interface RollbackPreStepPayload {
    agent: Agent;
    turn: number;
    step: number;
    signal: AbortSignal;
}
export type RollbackPreStepListener = (payload: RollbackPreStepPayload, next: () => Promise<unknown>) => Promise<unknown>;
export type RollbackWriteIntentListener = (target: FsTarget, actor: RollbackToolActor | undefined, next: () => unknown) => unknown;
export type RollbackEditIntentListener = (target: FsTarget, actor: RollbackToolActor | undefined, next: () => unknown) => unknown;
export type RollbackObservedListener = (target: FsTarget, observation: FsObservation, actor: RollbackToolActor | undefined) => void;
/** The subset of `ToolExecution` that reaches fs intent/observed events. */
export interface RollbackToolActor {
    readonly callId?: string;
    readonly name?: string;
    readonly arguments?: unknown;
    readonly agent?: Agent;
}
export type { Agent, FileSystem, FsInfo, FsObservation, FsTarget, FsVersion, Session, SessionEvent, SessionId };
