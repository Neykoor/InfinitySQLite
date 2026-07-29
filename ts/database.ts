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
      let closed = false;
      try {
        if (depth === 0) {
          this.native.exec("BEGIN");
        } else {
          this.native.exec(`SAVEPOINT ${savepoint}`);
        }
        const result = fn(...args);
        if (isThenable(result)) {
          closed = true;
          if (depth === 0) {
            this.native.exec("ROLLBACK");
          } else {
            this.native.exec(`ROLLBACK TO ${savepoint}`);
            this.native.exec(`RELEASE ${savepoint}`);
          }
          throw new InfinitySqliteError(
            "transaction() does not support async functions; the wrapped function must run and return synchronously"
          );
        }
        if (depth === 0) {
          this.native.exec("COMMIT");
        } else {
          this.native.exec(`RELEASE ${savepoint}`);
        }
        return result;
      } catch (error) {
        if (!closed && this.native.open) {
          if (depth === 0) {
            this.native.exec("ROLLBACK");
          } else {
            this.native.exec(`ROLLBACK TO ${savepoint}`);
            this.native.exec(`RELEASE ${savepoint}`);
          }
        }
        if (error instanceof InfinitySqliteError) throw error;
        throw wrapNativeError(error);
      } finally {
        this.transactionDepth = depth;
      }
    };
    return run;
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
