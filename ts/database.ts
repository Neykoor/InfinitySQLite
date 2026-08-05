import { loadNative, NativeDatabase, CheckpointResult } from "./native";
import { Statement } from "./statement";
import { InfinitySqliteError, wrapNativeError } from "./error";
import { SerialQueue, QueuedTask } from "./queue";

export interface DatabaseOptions {
  readonly?: boolean;
  timeout?: number;
}

export type TransactionFunction<Args extends unknown[], Result> = (...args: Args) => Result;
export type QueuedFunction<Args extends unknown[], Result> = (...args: Args) => Result | Promise<Result>;
export type CheckpointMode = "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE";

export interface FunctionOptions {
  argCount?: number;
  deterministic?: boolean;
}

export interface AggregateOptions<Acc = unknown> {
  start?: Acc;
  step: (accumulator: Acc, ...args: unknown[]) => Acc;
  result?: (accumulator: Acc) => unknown;
  argCount?: number;
  deterministic?: boolean;
}

function isThenable(value: unknown): boolean {
  return !!value && (typeof value === "object" || typeof value === "function") && typeof (value as { then?: unknown }).then === "function";
}

export class Database {
  private native: NativeDatabase;
  private transactionDepth: number;
  private taskQueue: SerialQueue;

  constructor(filename: string, options: DatabaseOptions = {}) {
    const nativeModule = loadNative();
    try {
      this.native = new nativeModule.InfinityDatabase(filename, options);
    } catch (error) {
      throw wrapNativeError(error);
    }
    this.transactionDepth = 0;
    this.taskQueue = new SerialQueue();
  }

  prepare<BindParameters extends unknown[] | object = unknown[], Result = unknown>(
    sql: string
  ): BindParameters extends unknown[] ? Statement<BindParameters, Result> : Statement<[BindParameters], Result> {
    try {
      const statement = new Statement<any, Result>(this.native.prepare(sql));
      return statement as BindParameters extends unknown[]
        ? Statement<BindParameters, Result>
        : Statement<[BindParameters], Result>;
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

  queue<Args extends unknown[], Result>(
    fn: QueuedFunction<Args, Result>
  ): (...args: Args) => Promise<Result> {
    return (...args: Args): Promise<Result> => {
      const task: QueuedTask<Result> = () => fn(...args);
      return this.taskQueue.push(task);
    };
  }

  get pendingQueued(): number {
    return this.taskQueue.pending;
  }

  setBusyTimeout(timeoutMs: number): this {
    try {
      this.native.setBusyTimeout(timeoutMs);
    } catch (error) {
      throw wrapNativeError(error);
    }
    return this;
  }

  function(name: string, fn: (...args: unknown[]) => unknown, options: FunctionOptions = {}): this {
    try {
      this.native.registerFunction(name, fn, options.argCount ?? -1, options.deterministic ?? false);
    } catch (error) {
      throw wrapNativeError(error);
    }
    return this;
  }

  aggregate<Acc = unknown>(name: string, options: AggregateOptions<Acc>): this {
    try {
      this.native.registerAggregate(
        name,
        options.step as (accumulator: unknown, ...args: unknown[]) => unknown,
        options.argCount ?? -1,
        options.deterministic ?? false,
        (options.result as ((accumulator: unknown) => unknown) | undefined) ?? null,
        options.start ?? null
      );
    } catch (error) {
      throw wrapNativeError(error);
    }
    return this;
  }

  checkpoint(mode: CheckpointMode = "PASSIVE"): CheckpointResult {
    try {
      return this.native.checkpoint(mode);
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  backup(destinationPath: string): void {
    try {
      this.native.backup(destinationPath);
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  serialize(): Buffer {
    try {
      return this.native.serialize();
    } catch (error) {
      throw wrapNativeError(error);
    }
  }

  deserialize(data: Buffer): void {
    try {
      this.native.deserialize(data);
    } catch (error) {
      throw wrapNativeError(error);
    }
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
