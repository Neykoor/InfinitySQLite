export class InfinitySqliteError extends Error {
  code?: string | number;
  type?: string;

  constructor(message: string, code?: string | number, type?: string) {
    super(message);
    this.name = "InfinitySqliteError";
    this.code = code;
    this.type = type;
  }

  get isConstraintViolation(): boolean {
    return typeof this.type === "string" && this.type.startsWith("SQLITE_CONSTRAINT");
  }

  get isUniqueViolation(): boolean {
    return this.type === "SQLITE_CONSTRAINT_UNIQUE" || this.type === "SQLITE_CONSTRAINT_PRIMARYKEY";
  }

  get isForeignKeyViolation(): boolean {
    return this.type === "SQLITE_CONSTRAINT_FOREIGNKEY";
  }

  get isBusy(): boolean {
    return typeof this.type === "string" && this.type.startsWith("SQLITE_BUSY");
  }
}

export function wrapNativeError(error: unknown): InfinitySqliteError {
  if (error instanceof InfinitySqliteError) return error;
  const nativeError = error as { message?: unknown; code?: unknown; type?: unknown };
  const message = typeof nativeError?.message === "string" ? nativeError.message : "Unknown SQLite error";
  const code = typeof nativeError?.code === "string" || typeof nativeError?.code === "number" ? nativeError.code : undefined;
  const type = typeof nativeError?.type === "string" ? nativeError.type : undefined;
  return new InfinitySqliteError(message, code, type);
}
