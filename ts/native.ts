import path from "path";

export interface NativeStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number };
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
  const buildPath = path.join(__dirname, "..", "build", "Release", "infinitysqlite.node");
  return require(buildPath) as NativeModule;
}
