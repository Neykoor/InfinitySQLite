#pragma once
#include <napi.h>
#include <vector>
#include "deps/sqlite3/sqlite3.h"

class InfinityStatement;

class InfinityDatabase : public Napi::ObjectWrap<InfinityDatabase> {
public:
  static Napi::Function GetClass(Napi::Env env);
  InfinityDatabase(const Napi::CallbackInfo &info);
  ~InfinityDatabase();

  sqlite3 *Handle() const { return handle_; }
  void RegisterStatement(InfinityStatement *stmt);
  void UnregisterStatement(InfinityStatement *stmt);

private:
  Napi::Value Prepare(const Napi::CallbackInfo &info);
  Napi::Value Exec(const Napi::CallbackInfo &info);
  Napi::Value Pragma(const Napi::CallbackInfo &info);
  Napi::Value SetBusyTimeout(const Napi::CallbackInfo &info);
  Napi::Value RegisterFunction(const Napi::CallbackInfo &info);
  Napi::Value RegisterAggregate(const Napi::CallbackInfo &info);
  Napi::Value Checkpoint(const Napi::CallbackInfo &info);
  Napi::Value Backup(const Napi::CallbackInfo &info);
  Napi::Value Serialize(const Napi::CallbackInfo &info);
  Napi::Value Deserialize(const Napi::CallbackInfo &info);
  Napi::Value Close(const Napi::CallbackInfo &info);
  Napi::Value IsOpenGetter(const Napi::CallbackInfo &info);
  Napi::Value NameGetter(const Napi::CallbackInfo &info);

  sqlite3 *handle_;
  std::string filename_;
  bool open_;
  std::vector<InfinityStatement *> statements_;
};
