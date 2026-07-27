export class InfinitySqliteError extends Error {
  code?: string | number;

  constructor(message: string, code?: string | number) {
    super(message);
    this.name = "InfinitySqliteError";
    this.code = code;
  }
}
