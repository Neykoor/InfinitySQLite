import { NativeStatement } from "./native";
import { wrapNativeError } from "./error";

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export class Statement<BindParameters extends unknown[] = unknown[], Result = unknown> {
  private native: NativeStatement;

  constructor(native: NativeStatement) {
    this.native = native;
  }

  run(...params: BindParameters): RunResult {
    try {
      return this.native.run(...params);
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  get(...params: BindParameters): Result | undefined {
    try {
      return this.native.get(...params) as Result | undefined;
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  all(...params: BindParameters): Result[] {
    try {
      return this.native.all(...params) as Result[];
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  *iterate(...params: BindParameters): IterableIterator<Result> {
    let iterator: IterableIterator<unknown>;
    try {
      iterator = this.native.iterate(...params);
    } catch (error) {
      throw wrapNativeError(error);
    }
    try {
      for (const row of iterator) {
        yield row as Result;
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
