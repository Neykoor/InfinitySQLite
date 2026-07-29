#pragma once
#include <napi.h>
#include "deps/sqlite3/sqlite3.h"

namespace InfinityBinder {
  void BindValue(Napi::Env env, sqlite3_stmt *stmt, int index, const Napi::Value &value);
  Napi::Value ColumnToValue(Napi::Env env, sqlite3_stmt *stmt, int column);
  const char *ErrorCodeName(int code);
  void ThrowSqliteError(Napi::Env env, sqlite3 *db, int code);
}
