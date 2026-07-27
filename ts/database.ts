import { loadNative, NativeDatabase } from "./native";
import { Statement } from "./statement";
import { InfinitySqliteError } from "./error";

export interface DatabaseOptions {
  readonly?: boolean;
}

export type TransactionFunction<Args extends unknown[], Result> = (...args: Args) => Result;

export class Database {
  private native: NativeDatabase;
  private transactionDepth: number;

  constructor(filename: string, options: DatabaseOptions = {}) {
    const nativeModule = loadNative();
    try {
      this.native = new nativeModule.InfinityDatabase(filename, options);
    } catch (error) {
      throw new InfinitySqliteError((error as Error).message);
    }
    this.transactionDepth = 0;
  }

  prepare<Row = unknown>(sql: string): Statement<Row> {
    return new Statement<Row>(this.native.prepare(sql));
  }

  exec(sql: string): this {
    this.native.exec(sql);
    return this;
  }

  pragma(pragma: string): unknown {
    return this.native.pragma(pragma);
  }

  transaction<Args extends unknown[], Result>(
    fn: TransactionFunction<Args, Result>
  ): TransactionFunction<Args, Result> {
    const run = (...args: Args): Result => {
      const depth = this.transactionDepth;
      const savepoint = `infinitysqlite_sp_${depth}`;
      this.transactionDepth = depth + 1;
      if (depth === 0) {
        this.native.exec("BEGIN");
      } else {
        this.native.exec(`SAVEPOINT ${savepoint}`);
      }
      try {
        const result = fn(...args);
        if (depth === 0) {
          this.native.exec("COMMIT");
        } else {
          this.native.exec(`RELEASE ${savepoint}`);
        }
        return result;
      } catch (error) {
        if (depth === 0) {
          this.native.exec("ROLLBACK");
        } else {
          this.native.exec(`ROLLBACK TO ${savepoint}`);
          this.native.exec(`RELEASE ${savepoint}`);
        }
        throw error;
      } finally {
        this.transactionDepth = depth;
      }
    };
    return run;
  }

  close(): void {
    this.native.close();
  }

  get open(): boolean {
    return this.native.open;
  }

  get name(): string {
    return this.native.name;
  }
}
