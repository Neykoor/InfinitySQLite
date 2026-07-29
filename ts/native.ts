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

export interface NativeDatabase {
  prepare(sql: string): NativeStatement;
  exec(sql: string): NativeDatabase;
  pragma(pragma: string): unknown;
  close(): void;
  readonly open: boolean;
  readonly name: string;
}

export interface NativeModule {
  InfinityDatabase: new (filename: string, options?: { readonly?: boolean }) => NativeDatabase;
}

export function loadNative(): NativeModule {
  return getBinding();
}
