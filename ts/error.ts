export class InfinitySqliteError extends Error {
  code?: string | number;

  constructor(message: string, code?: string | number) {
    super(message);
    this.name = "InfinitySqliteError";
    this.code = code;
  }
}

export function wrapNativeError(error: unknown): InfinitySqliteError {
  if (error instanceof InfinitySqliteError) return error;
  const nativeError = error as { message?: unknown; code?: unknown };
  const message = typeof nativeError?.message === "string" ? nativeError.message : "Unknown SQLite error";
  const code = typeof nativeError?.code === "string" || typeof nativeError?.code === "number" ? nativeError.code : undefined;
  return new InfinitySqliteError(message, code);
}
