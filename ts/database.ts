import { loadNative, NativeDatabase } from "./native";
import { Statement } from "./statement";
import { InfinitySqliteError } from "./error";

export interface DatabaseOptions {
  readonly?: boolean;
}

export type TransactionFunction<Args extends unknown[], Result> = (...args: Args) => Result;

export class Database {
  private native: NativeDatabase;
  private statementCache: Map<string, Statement<unknown>>;

  constructor(filename: string, options: DatabaseOptions = {}) {
    const nativeModule = loadNative();
    try {
      this.native = new nativeModule.InfinityDatabase(filename, options);
    } catch (error) {
      throw new InfinitySqliteError((error as Error).message);
    }
    this.statementCache = new Map();
  }

  prepare<Row = unknown>(sql: string): Statement<Row> {
    const cached = this.statementCache.get(sql);
    if (cached) return cached as Statement<Row>;
    const statement = new Statement<Row>(this.native.prepare(sql));
    this.statementCache.set(sql, statement as Statement<unknown>);
    return statement;
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
      this.native.exec("BEGIN");
      try {
        const result = fn(...args);
        this.native.exec("COMMIT");
        return result;
      } catch (error) {
        this.native.exec("ROLLBACK");
        throw error;
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
