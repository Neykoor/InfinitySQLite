#include "database.h"
#include "statement.h"
#include "binder.h"

Napi::Function InfinityDatabase::GetClass(Napi::Env env) {
  return DefineClass(env, "InfinityDatabase", {
    InstanceMethod("prepare", &InfinityDatabase::Prepare),
    InstanceMethod("exec", &InfinityDatabase::Exec),
    InstanceMethod("pragma", &InfinityDatabase::Pragma),
    InstanceMethod("close", &InfinityDatabase::Close),
    InstanceAccessor("open", &InfinityDatabase::IsOpenGetter, nullptr),
    InstanceAccessor("name", &InfinityDatabase::NameGetter, nullptr),
  });
}

InfinityDatabase::InfinityDatabase(const Napi::CallbackInfo &info)
  : Napi::ObjectWrap<InfinityDatabase>(info), handle_(nullptr), open_(false) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected database file path as first argument").ThrowAsJavaScriptException();
    return;
  }
  filename_ = info[0].As<Napi::String>().Utf8Value();
  int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX;
  if (info.Length() > 1 && info[1].IsObject()) {
    Napi::Object opts = info[1].As<Napi::Object>();
    if (opts.Has("readonly") && opts.Get("readonly").ToBoolean().Value()) {
      flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX;
    }
  }
  int rc = sqlite3_open_v2(filename_.c_str(), &handle_, flags, nullptr);
  if (rc != SQLITE_OK) {
    std::string message = handle_ ? sqlite3_errmsg(handle_) : "Failed to open database";
    Napi::Error::New(env, message).ThrowAsJavaScriptException();
    if (handle_) sqlite3_close_v2(handle_);
    handle_ = nullptr;
    return;
  }
  sqlite3_busy_timeout(handle_, 5000);
  open_ = true;
}

InfinityDatabase::~InfinityDatabase() {
  if (open_ && handle_) {
    sqlite3_close_v2(handle_);
  }
  handle_ = nullptr;
}

Napi::Value InfinityDatabase::Prepare(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!open_ || !handle_) {
    Napi::Error::New(env, "Database connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected SQL string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string sql = info[0].As<Napi::String>().Utf8Value();
  sqlite3_stmt *stmt = nullptr;
  const char *tail = nullptr;
  int rc = sqlite3_prepare_v2(handle_, sql.c_str(), -1, &stmt, &tail);
  if (rc != SQLITE_OK) {
    InfinityBinder::ThrowSqliteError(env, handle_, rc);
    return env.Undefined();
  }
  if (tail) {
    while (*tail == ' ' || *tail == '\n' || *tail == '\t' || *tail == '\r' || *tail == ';') tail++;
    if (*tail != '\0') {
      sqlite3_finalize(stmt);
      Napi::Error::New(env, "prepare() only supports a single SQL statement").ThrowAsJavaScriptException();
      return env.Undefined();
    }
  }
  return InfinityStatement::Create(env, handle_, stmt, false);
}

Napi::Value InfinityDatabase::Exec(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!open_ || !handle_) {
    Napi::Error::New(env, "Database connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected SQL string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string sql = info[0].As<Napi::String>().Utf8Value();
  char *errmsg = nullptr;
  int rc = sqlite3_exec(handle_, sql.c_str(), nullptr, nullptr, &errmsg);
  if (rc != SQLITE_OK) {
    std::string message = errmsg ? errmsg : "Unknown SQLite error";
    sqlite3_free(errmsg);
    Napi::Error::New(env, message).ThrowAsJavaScriptException();
  }
  return info.This();
}

Napi::Value InfinityDatabase::Pragma(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!open_ || !handle_) {
    Napi::Error::New(env, "Database connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected pragma string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string pragma = info[0].As<Napi::String>().Utf8Value();
  std::string sql = "PRAGMA " + pragma + ";";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(handle_, sql.c_str(), -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    InfinityBinder::ThrowSqliteError(env, handle_, rc);
    return env.Undefined();
  }
  Napi::Array results = Napi::Array::New(env);
  uint32_t idx = 0;
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    int cols = sqlite3_column_count(stmt);
    if (cols == 1) {
      results.Set(idx++, InfinityBinder::ColumnToValue(env, stmt, 0));
    } else {
      Napi::Object row = Napi::Object::New(env);
      for (int i = 0; i < cols; i++) {
        row.Set(sqlite3_column_name(stmt, i), InfinityBinder::ColumnToValue(env, stmt, i));
      }
      results.Set(idx++, row);
    }
  }
  sqlite3_finalize(stmt);
  return results;
}

Napi::Value InfinityDatabase::Close(const Napi::CallbackInfo &info) {
  if (open_ && handle_) {
    sqlite3_close_v2(handle_);
    open_ = false;
  }
  handle_ = nullptr;
  return info.Env().Undefined();
}

Napi::Value InfinityDatabase::IsOpenGetter(const Napi::CallbackInfo &info) {
  return Napi::Boolean::New(info.Env(), open_);
}

Napi::Value InfinityDatabase::NameGetter(const Napi::CallbackInfo &info) {
  return Napi::String::New(info.Env(), filename_);
}
