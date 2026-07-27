#pragma once
#include <napi.h>
#include "deps/sqlite3/sqlite3.h"

class InfinityDatabase : public Napi::ObjectWrap<InfinityDatabase> {
public:
  static Napi::Function GetClass(Napi::Env env);
  InfinityDatabase(const Napi::CallbackInfo &info);
  ~InfinityDatabase();

private:
  Napi::Value Prepare(const Napi::CallbackInfo &info);
  Napi::Value Exec(const Napi::CallbackInfo &info);
  Napi::Value Pragma(const Napi::CallbackInfo &info);
  Napi::Value Close(const Napi::CallbackInfo &info);
  Napi::Value IsOpenGetter(const Napi::CallbackInfo &info);
  Napi::Value NameGetter(const Napi::CallbackInfo &info);

  sqlite3 *handle_;
  std::string filename_;
  bool open_;
};
