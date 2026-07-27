#pragma once
#include <napi.h>
#include "deps/sqlite3/sqlite3.h"

class InfinityStatement : public Napi::ObjectWrap<InfinityStatement> {
public:
  static Napi::Function GetClass(Napi::Env env);
  InfinityStatement(const Napi::CallbackInfo &info);
  ~InfinityStatement();

  static Napi::Object Create(Napi::Env env, sqlite3 *db, sqlite3_stmt *stmt, bool pluckMode);

private:
  Napi::Value Run(const Napi::CallbackInfo &info);
  Napi::Value Get(const Napi::CallbackInfo &info);
  Napi::Value All(const Napi::CallbackInfo &info);
  Napi::Value Iterate(const Napi::CallbackInfo &info);
  Napi::Value Pluck(const Napi::CallbackInfo &info);
  Napi::Value Finalize(const Napi::CallbackInfo &info);
  Napi::Value ColumnNames(const Napi::CallbackInfo &info);

  bool EnsureUsable(Napi::Env env);
  void BindAll(const Napi::CallbackInfo &info, size_t startIndex);
  void BindOne(int index, const Napi::Value &value);
  Napi::Object RowToObject(Napi::Env env);
  Napi::Value RowToPluck(Napi::Env env);

  sqlite3 *db_;
  sqlite3_stmt *stmt_;
  bool pluck_;
  bool finalized_;
};
