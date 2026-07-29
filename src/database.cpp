#include "database.h"
#include "statement.h"
#include "binder.h"
#include <algorithm>

Napi::Function InfinityDatabase::GetClass(Napi::Env env) {
  return DefineClass(env, "InfinityDatabase", {
    InstanceMethod("prepare", &InfinityDatabase::Prepare),
    InstanceMethod("exec", &InfinityDatabase::Exec),
    InstanceMethod("pragma", &InfinityDatabase::Pragma),
    InstanceMethod("setBusyTimeout", &InfinityDatabase::SetBusyTimeout),
    InstanceMethod("registerFunction", &InfinityDatabase::RegisterFunction),
    InstanceMethod("checkpoint", &InfinityDatabase::Checkpoint),
    InstanceMethod("backup", &InfinityDatabase::Backup),
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
  int timeoutMs = 5000;
  if (info.Length() > 1 && info[1].IsObject()) {
    Napi::Object opts = info[1].As<Napi::Object>();
    if (opts.Has("readonly") && opts.Get("readonly").ToBoolean().Value()) {
      flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX;
    }
    if (opts.Has("timeout") && opts.Get("timeout").IsNumber()) {
      int requested = opts.Get("timeout").As<Napi::Number>().Int32Value();
      if (requested < 0) {
        Napi::RangeError::New(env, "timeout option must be a non-negative number of milliseconds").ThrowAsJavaScriptException();
        return;
      }
      timeoutMs = requested;
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
  sqlite3_busy_timeout(handle_, timeoutMs);
  sqlite3_extended_result_codes(handle_, 1);
  open_ = true;
}

InfinityDatabase::~InfinityDatabase() {
  if (open_ && handle_) {
    for (InfinityStatement *stmt : statements_) {
      stmt->CloseByOwner();
    }
    statements_.clear();
    sqlite3_close_v2(handle_);
  }
  handle_ = nullptr;
}

void InfinityDatabase::RegisterStatement(InfinityStatement *stmt) {
  statements_.push_back(stmt);
}

void InfinityDatabase::UnregisterStatement(InfinityStatement *stmt) {
  statements_.erase(std::remove(statements_.begin(), statements_.end(), stmt), statements_.end());
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
  if (!stmt) {
    Napi::Error::New(env, "SQL string contains no statement to prepare").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (tail) {
    while (*tail != '\0') {
      if (*tail == ' ' || *tail == '\n' || *tail == '\t' || *tail == '\r' || *tail == ';') {
        tail++;
      } else if (tail[0] == '-' && tail[1] == '-') {
        while (*tail != '\0' && *tail != '\n') tail++;
      } else if (tail[0] == '/' && tail[1] == '*') {
        tail += 2;
        while (*tail != '\0' && !(tail[0] == '*' && tail[1] == '/')) tail++;
        if (*tail != '\0') tail += 2;
      } else {
        break;
      }
    }
    if (*tail != '\0') {
      sqlite3_finalize(stmt);
      Napi::Error::New(env, "prepare() only supports a single SQL statement").ThrowAsJavaScriptException();
      return env.Undefined();
    }
  }
  return InfinityStatement::Create(env, this, stmt, false);
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
  if (!stmt) {
    return Napi::Array::New(env);
  }
  Napi::Array results = Napi::Array::New(env);
  uint32_t idx = 0;
  while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
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
  if (rc != SQLITE_DONE) {
    InfinityBinder::ThrowSqliteError(env, handle_, rc);
    return env.Undefined();
  }
  return results;
}

Napi::Value InfinityDatabase::SetBusyTimeout(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!open_ || !handle_) {
    Napi::Error::New(env, "Database connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected timeout in milliseconds as a number").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  int timeoutMs = info[0].As<Napi::Number>().Int32Value();
  if (timeoutMs < 0) {
    Napi::RangeError::New(env, "timeout must be a non-negative number of milliseconds").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  sqlite3_busy_timeout(handle_, timeoutMs);
  return info.This();
}

Napi::Value InfinityDatabase::RegisterFunction(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!open_ || !handle_) {
    Napi::Error::New(env, "Database connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 4 || !info[0].IsString() || !info[1].IsFunction() || !info[2].IsNumber() || !info[3].IsBoolean()) {
    Napi::TypeError::New(env, "Expected (name, fn, nArg, deterministic)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string name = info[0].As<Napi::String>().Utf8Value();
  int nArg = info[2].As<Napi::Number>().Int32Value();
  bool deterministic = info[3].As<Napi::Boolean>().Value();

  auto *data = new InfinityBinder::FunctionUserData(env, info[1].As<Napi::Function>());

  int flags = SQLITE_UTF8;
  if (deterministic) flags |= SQLITE_DETERMINISTIC;

  int rc = sqlite3_create_function_v2(
    handle_, name.c_str(), nArg, flags, data,
    InfinityBinder::InvokeFunction, nullptr, nullptr,
    InfinityBinder::DestroyFunctionUserData
  );

  if (rc != SQLITE_OK) {
    delete data;
    InfinityBinder::ThrowSqliteError(env, handle_, rc);
    return env.Undefined();
  }

  return env.Undefined();
}

Napi::Value InfinityDatabase::Checkpoint(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!open_ || !handle_) {
    Napi::Error::New(env, "Database connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  int mode = SQLITE_CHECKPOINT_PASSIVE;
  if (info.Length() > 0 && info[0].IsString()) {
    std::string modeStr = info[0].As<Napi::String>().Utf8Value();
    if (modeStr == "FULL") {
      mode = SQLITE_CHECKPOINT_FULL;
    } else if (modeStr == "RESTART") {
      mode = SQLITE_CHECKPOINT_RESTART;
    } else if (modeStr == "TRUNCATE") {
      mode = SQLITE_CHECKPOINT_TRUNCATE;
    } else if (modeStr != "PASSIVE") {
      Napi::TypeError::New(env, "checkpoint mode must be one of PASSIVE, FULL, RESTART, TRUNCATE").ThrowAsJavaScriptException();
      return env.Undefined();
    }
  }
  int walPages = 0;
  int checkpointedPages = 0;
  int rc = sqlite3_wal_checkpoint_v2(handle_, nullptr, mode, &walPages, &checkpointedPages);
  if (rc != SQLITE_OK) {
    InfinityBinder::ThrowSqliteError(env, handle_, rc);
    return env.Undefined();
  }
  Napi::Object result = Napi::Object::New(env);
  result.Set("walPages", Napi::Number::New(env, walPages));
  result.Set("checkpointedPages", Napi::Number::New(env, checkpointedPages));
  return result;
}

Napi::Value InfinityDatabase::Backup(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!open_ || !handle_) {
    Napi::Error::New(env, "Database connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected destination file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string destPath = info[0].As<Napi::String>().Utf8Value();

  sqlite3 *destHandle = nullptr;
  int rc = sqlite3_open_v2(destPath.c_str(), &destHandle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nullptr);
  if (rc != SQLITE_OK) {
    std::string message = destHandle ? sqlite3_errmsg(destHandle) : "Failed to open backup destination";
    if (destHandle) sqlite3_close_v2(destHandle);
    Napi::Error::New(env, message).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  sqlite3_backup *backup = sqlite3_backup_init(destHandle, "main", handle_, "main");
  if (!backup) {
    std::string message = sqlite3_errmsg(destHandle);
    sqlite3_close_v2(destHandle);
    Napi::Error::New(env, message).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  do {
    rc = sqlite3_backup_step(backup, 100);
  } while (rc == SQLITE_OK || rc == SQLITE_BUSY || rc == SQLITE_LOCKED);

  sqlite3_backup_finish(backup);

  if (rc != SQLITE_DONE) {
    std::string message = sqlite3_errmsg(destHandle);
    sqlite3_close_v2(destHandle);
    Napi::Error::New(env, message).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  sqlite3_close_v2(destHandle);
  return env.Undefined();
}

Napi::Value InfinityDatabase::Close(const Napi::CallbackInfo &info) {
  if (open_ && handle_) {
    for (InfinityStatement *stmt : statements_) {
      stmt->CloseByOwner();
    }
    statements_.clear();
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
