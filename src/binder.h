#pragma once
#include <napi.h>
#include "deps/sqlite3/sqlite3.h"

namespace InfinityBinder {
  void BindValue(Napi::Env env, sqlite3_stmt *stmt, int index, const Napi::Value &value);
  Napi::Value ColumnToValue(Napi::Env env, sqlite3_stmt *stmt, int column);
  const char *ErrorCodeName(int code);
  void ThrowSqliteError(Napi::Env env, sqlite3 *db, int code);

  struct FunctionUserData {
    Napi::Env env;
    Napi::FunctionReference fn;
    FunctionUserData(Napi::Env e, Napi::Function f) : env(e), fn(Napi::Persistent(f)) {}
  };

  Napi::Value SqliteValueToNapi(Napi::Env env, sqlite3_value *value);
  void SetSqliteResult(sqlite3_context *ctx, Napi::Env env, const Napi::Value &value);
  void InvokeFunction(sqlite3_context *ctx, int argc, sqlite3_value **argv);
  void DestroyFunctionUserData(void *data);

  struct AggregateUserData {
    Napi::Env env;
    Napi::Reference<Napi::Value> startValue;
    Napi::FunctionReference stepFn;
    Napi::FunctionReference resultFn;
    bool hasResultFn;
    AggregateUserData(Napi::Env e, Napi::Value start, Napi::Function step)
      : env(e), startValue(Napi::Persistent(start)), stepFn(Napi::Persistent(step)), hasResultFn(false) {}
  };

  struct AggregateContextState {
    bool initialized;
    bool errored;
    Napi::Reference<Napi::Value> *accumulator;
  };

  void AggregateStep(sqlite3_context *ctx, int argc, sqlite3_value **argv);
  void AggregateFinal(sqlite3_context *ctx);
  void DestroyAggregateUserData(void *data);
}
