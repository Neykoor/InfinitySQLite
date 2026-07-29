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
  checkpoint(mode?: string): CheckpointResult;
  backup(destinationPath: string): void;
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
