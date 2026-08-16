import type { RollbackErrorCode, RollbackFailure, RollbackResult } from '../shared/types.ts';
export declare function ok<T>(value: T): RollbackResult<T>;
export declare function fail<T = never>(code: RollbackErrorCode, message: string, fields?: Partial<Omit<RollbackFailure, 'code' | 'message'>>): RollbackResult<T>;
export declare function isRollbackFailure(value: unknown): value is RollbackResult<never>;
