import { NativeStatement } from "./native";
import { wrapNativeError } from "./error";

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
    try {
      return this.native.run(...params);
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  get(...params: unknown[]): Row | undefined {
    try {
      return this.native.get(...params) as Row | undefined;
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  all(...params: unknown[]): Row[] {
    try {
      return this.native.all(...params) as Row[];
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  *iterate(...params: unknown[]): IterableIterator<Row> {
    let iterator: IterableIterator<unknown>;
    try {
      iterator = this.native.iterate(...params);
    } catch (error) {
      throw wrapNativeError(error);
    }
    try {
      for (const row of iterator) {
        yield row as Row;
      }
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  pluck(enable = true): this {
    try {
      this.native.pluck(enable);
    } catch (error) {
      throw wrapNativeError(error);
    }
    return this;
  }

  columns(): string[] {
    try {
      return this.native.columns();
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  finalize(): void {
    try {
      this.native.finalize();
    } catch (error) {
      throw wrapNativeError(error);
    }
  }
}
