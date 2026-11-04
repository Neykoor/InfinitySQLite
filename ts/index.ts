import { Database } from "./database";
import { Statement } from "./statement";
import { InfinitySqliteError } from "./error";

type InfinitySqliteExports = typeof Database & {
  Database: typeof Database;
  Statement: typeof Statement;
  InfinitySqliteError: typeof InfinitySqliteError;
};

const exported = Database as InfinitySqliteExports;
exported.Database = Database;
exported.Statement = Statement;
exported.InfinitySqliteError = InfinitySqliteError;

export = exported;
