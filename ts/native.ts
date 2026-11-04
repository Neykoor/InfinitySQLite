import { getBinding } from "./binding";

export interface NativeStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  iterate(...params: unknown[]): IterableIterator<unknown>;
  pluck(enable?: boolean): NativeStatement;
  finalize(): void;
  columns(): string[];
}

export interface CheckpointResult {
  walPages: number;
  checkpointedPages: number;
}

export interface NativeDatabase {
  prepare(sql: string): NativeStatement;
  exec(sql: string): NativeDatabase;
  pragma(pragma: string): unknown;
  setBusyTimeout(timeoutMs: number): NativeDatabase;
  registerFunction(name: string, fn: (...args: unknown[]) => unknown, nArg: number, deterministic: boolean): void;
  registerAggregate(
    name: string,
    stepFn: (accumulator: unknown, ...args: unknown[]) => unknown,
    nArg: number,
    deterministic: boolean,
    resultFn: ((accumulator: unknown) => unknown) | null,
    start: unknown
  ): void;
  checkpoint(mode?: string): CheckpointResult;
  backup(destinationPath: string): void;
  serialize(): Buffer;
  deserialize(data: Buffer): void;
  close(): void;
  readonly open: boolean;
  readonly name: string;
}

export interface NativeModule {
  InfinityDatabase: new (filename: string, options?: { readonly?: boolean; timeout?: number }) => NativeDatabase;
}

export function loadNative(): NativeModule {
  return getBinding();
}
