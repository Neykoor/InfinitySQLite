import { loadNative, NativeDatabase } from "./native";
import { Statement } from "./statement";
import { InfinitySqliteError, wrapNativeError } from "./error";

export interface DatabaseOptions {
  readonly?: boolean;
}

export type TransactionFunction<Args extends unknown[], Result> = (...args: Args) => Result;

function isThenable(value: unknown): boolean {
  return !!value && (typeof value === "object" || typeof value === "function") && typeof (value as { then?: unknown }).then === "function";
}

export class Database {
  private native: NativeDatabase;
  private transactionDepth: number;

  constructor(filename: string, options: DatabaseOptions = {}) {
    const nativeModule = loadNative();
    try {
      this.native = new nativeModule.InfinityDatabase(filename, options);
    } catch (error) {
      throw wrapNativeError(error);
    }
    this.transactionDepth = 0;
  }

  prepare<Row = unknown>(sql: string): Statement<Row> {
    try {
      return new Statement<Row>(this.native.prepare(sql));
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  exec(sql: string): this {
    try {
      this.native.exec(sql);
    } catch (error) {
      throw wrapNativeError(error);
    }
    return this;
  }

  pragma(pragma: string): unknown {
    try {
      return this.native.pragma(pragma);
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  transaction<Args extends unknown[], Result>(
    fn: TransactionFunction<Args, Result>
  ): TransactionFunction<Args, Result> {
    const run = (...args: Args): Result => {
      const depth = this.transactionDepth;
      const savepoint = `infinitysqlite_sp_${depth}`;
      this.transactionDepth = depth + 1;
      try {
        try {
          if (depth === 0) {
            this.native.exec("BEGIN");
          } else {
            this.native.exec(`SAVEPOINT ${savepoint}`);
          }
        } catch (error) {
          throw wrapNativeError(error);
        }

        let result: Result;
        try {
          result = fn(...args);
        } catch (error) {
          this.rollbackTransaction(depth, savepoint);
          throw error;
        }

        if (isThenable(result)) {
          this.rollbackTransaction(depth, savepoint);
          throw new InfinitySqliteError(
            "transaction() does not support async functions; the wrapped function must run and return synchronously"
          );
        }

        try {
          if (depth === 0) {
            this.native.exec("COMMIT");
          } else {
            this.native.exec(`RELEASE ${savepoint}`);
          }
        } catch (error) {
          throw wrapNativeError(error);
        }

        return result;
      } finally {
        this.transactionDepth = depth;
      }
    };
    return run;
  }

  private rollbackTransaction(depth: number, savepoint: string): void {
    if (!this.native.open) return;
    try {
      if (depth === 0) {
        this.native.exec("ROLLBACK");
      } else {
        this.native.exec(`ROLLBACK TO ${savepoint}`);
        this.native.exec(`RELEASE ${savepoint}`);
      }
    } catch {
    }
  }

  close(): void {
    try {
      this.native.close();
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  get open(): boolean {
    return this.native.open;
  }

  get name(): string {
    return this.native.name;
  }
}
