import { NativeStatement } from "./native";

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export class Statement<Row = unknown> {
  private native: NativeStatement;

  constructor(native: NativeStatement) {
    this.native = native;
  }

  run(...params: unknown[]): RunResult {
    return this.native.run(...params);
  }

  get(...params: unknown[]): Row | undefined {
    return this.native.get(...params) as Row | undefined;
  }

  all(...params: unknown[]): Row[] {
    return this.native.all(...params) as Row[];
  }

  *iterate(...params: unknown[]): IterableIterator<Row> {
    const iterator = this.native.iterate(...params);
    for (const row of iterator) {
      yield row as Row;
    }
  }

  pluck(enable = true): this {
    this.native.pluck(enable);
    return this;
  }

  columns(): string[] {
    return this.native.columns();
  }

  finalize(): void {
    this.native.finalize();
  }
}
