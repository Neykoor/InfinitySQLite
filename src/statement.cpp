#include "statement.h"
#include "binder.h"

Napi::FunctionReference statementConstructor;

Napi::Function InfinityStatement::GetClass(Napi::Env env) {
  Napi::Function func = DefineClass(env, "InfinityStatement", {
    InstanceMethod("run", &InfinityStatement::Run),
    InstanceMethod("get", &InfinityStatement::Get),
    InstanceMethod("all", &InfinityStatement::All),
    InstanceMethod("iterate", &InfinityStatement::Iterate),
    InstanceMethod("pluck", &InfinityStatement::Pluck),
    InstanceMethod("finalize", &InfinityStatement::Finalize),
    InstanceMethod("columns", &InfinityStatement::ColumnNames),
  });
  statementConstructor = Napi::Persistent(func);
  statementConstructor.SuppressDestruct();
  return func;
}

InfinityStatement::InfinityStatement(const Napi::CallbackInfo &info)
  : Napi::ObjectWrap<InfinityStatement>(info), db_(nullptr), stmt_(nullptr), pluck_(false), finalized_(false) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsExternal() || !info[1].IsExternal()) {
    Napi::TypeError::New(env, "Invalid internal construction of InfinityStatement").ThrowAsJavaScriptException();
    return;
  }
  db_ = info[0].As<Napi::External<sqlite3>>().Data();
  stmt_ = info[1].As<Napi::External<sqlite3_stmt>>().Data();
  if (info.Length() >= 3 && info[2].IsBoolean()) {
    pluck_ = info[2].As<Napi::Boolean>().Value();
  }
}

InfinityStatement::~InfinityStatement() {
  if (!finalized_ && stmt_) {
    sqlite3_finalize(stmt_);
  }
  stmt_ = nullptr;
}

Napi::Object InfinityStatement::Create(Napi::Env env, sqlite3 *db, sqlite3_stmt *stmt, bool pluckMode) {
  return statementConstructor.New({
    Napi::External<sqlite3>::New(env, db),
    Napi::External<sqlite3_stmt>::New(env, stmt),
    Napi::Boolean::New(env, pluckMode)
  });
}

bool InfinityStatement::EnsureUsable(Napi::Env env) {
  if (finalized_ || !stmt_) {
    Napi::Error::New(env, "Statement is finalized and can no longer be used").ThrowAsJavaScriptException();
    return false;
  }
  return true;
}

void InfinityStatement::BindOne(int index, const Napi::Value &value) {
  InfinityBinder::BindValue(value.Env(), stmt_, index, value);
}

void InfinityStatement::BindAll(const Napi::CallbackInfo &info, size_t startIndex) {
  Napi::Env env = info.Env();
  sqlite3_clear_bindings(stmt_);
  size_t argIndex = startIndex;
  if (info.Length() > startIndex && info[startIndex].IsObject() && !info[startIndex].IsArray() && !info[startIndex].IsBuffer()) {
    Napi::Object obj = info[startIndex].As<Napi::Object>();
    Napi::Array keys = obj.GetPropertyNames();
    for (uint32_t i = 0; i < keys.Length(); i++) {
      std::string key = keys.Get(i).As<Napi::String>().Utf8Value();
      std::string named = ":" + key;
      int idx = sqlite3_bind_parameter_index(stmt_, named.c_str());
      if (idx == 0) {
        named = "@" + key;
        idx = sqlite3_bind_parameter_index(stmt_, named.c_str());
      }
      if (idx == 0) {
        named = "$" + key;
        idx = sqlite3_bind_parameter_index(stmt_, named.c_str());
      }
      if (idx > 0) {
        BindOne(idx, obj.Get(key));
      }
    }
    return;
  }
  int position = 1;
  for (; argIndex < info.Length(); argIndex++) {
    BindOne(position++, info[argIndex]);
  }
  (void)env;
}

Napi::Object InfinityStatement::RowToObject(Napi::Env env) {
  Napi::Object row = Napi::Object::New(env);
  int cols = sqlite3_column_count(stmt_);
  for (int i = 0; i < cols; i++) {
    const char *name = sqlite3_column_name(stmt_, i);
    row.Set(name, InfinityBinder::ColumnToValue(env, stmt_, i));
  }
  return row;
}

Napi::Value InfinityStatement::RowToPluck(Napi::Env env) {
  if (sqlite3_column_count(stmt_) == 0) return env.Null();
  return InfinityBinder::ColumnToValue(env, stmt_, 0);
}

Napi::Value InfinityStatement::Run(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!EnsureUsable(env)) return env.Undefined();
  sqlite3_reset(stmt_);
  BindAll(info, 0);
  int rc = sqlite3_step(stmt_);
  if (rc != SQLITE_DONE && rc != SQLITE_ROW) {
    sqlite3_reset(stmt_);
    InfinityBinder::ThrowSqliteError(env, db_, rc);
    return env.Undefined();
  }
  Napi::Object result = Napi::Object::New(env);
  result.Set("changes", Napi::Number::New(env, sqlite3_changes(db_)));
  sqlite3_int64 lastId = sqlite3_last_insert_rowid(db_);
  if (lastId > 9007199254740992LL || lastId < -9007199254740992LL) {
    result.Set("lastInsertRowid", Napi::BigInt::New(env, static_cast<int64_t>(lastId)));
  } else {
    result.Set("lastInsertRowid", Napi::Number::New(env, static_cast<double>(lastId)));
  }
  sqlite3_reset(stmt_);
  return result;
}

Napi::Value InfinityStatement::Get(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!EnsureUsable(env)) return env.Undefined();
  sqlite3_reset(stmt_);
  BindAll(info, 0);
  int rc = sqlite3_step(stmt_);
  if (rc == SQLITE_ROW) {
    Napi::Value result = pluck_ ? RowToPluck(env) : (Napi::Value)RowToObject(env);
    sqlite3_reset(stmt_);
    return result;
  }
  sqlite3_reset(stmt_);
  if (rc != SQLITE_DONE) {
    InfinityBinder::ThrowSqliteError(env, db_, rc);
  }
  return env.Undefined();
}

Napi::Value InfinityStatement::All(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!EnsureUsable(env)) return env.Undefined();
  sqlite3_reset(stmt_);
  BindAll(info, 0);
  Napi::Array results = Napi::Array::New(env);
  uint32_t idx = 0;
  int rc;
  while ((rc = sqlite3_step(stmt_)) == SQLITE_ROW) {
    Napi::Value row = pluck_ ? RowToPluck(env) : (Napi::Value)RowToObject(env);
    results.Set(idx++, row);
  }
  sqlite3_reset(stmt_);
  if (rc != SQLITE_DONE) {
    InfinityBinder::ThrowSqliteError(env, db_, rc);
  }
  return results;
}

Napi::Value InfinityStatement::Iterate(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!EnsureUsable(env)) return env.Undefined();
  sqlite3_reset(stmt_);
  BindAll(info, 0);
  Napi::Object iterator = Napi::Object::New(env);
  auto stmtRef = Napi::Persistent(info.This().As<Napi::Object>());
  stmtRef.SuppressDestruct();
  InfinityStatement *self = this;
  auto nextFn = Napi::Function::New(env, [self, env](const Napi::CallbackInfo &cbInfo) -> Napi::Value {
    if (self->finalized_ || !self->stmt_) {
      Napi::Error::New(cbInfo.Env(), "Statement is finalized and can no longer be used").ThrowAsJavaScriptException();
      return cbInfo.Env().Undefined();
    }
    Napi::Object result = Napi::Object::New(cbInfo.Env());
    int rc = sqlite3_step(self->stmt_);
    if (rc == SQLITE_ROW) {
      result.Set("done", Napi::Boolean::New(cbInfo.Env(), false));
      result.Set("value", self->pluck_ ? self->RowToPluck(cbInfo.Env()) : (Napi::Value)self->RowToObject(cbInfo.Env()));
    } else {
      result.Set("done", Napi::Boolean::New(cbInfo.Env(), true));
      result.Set("value", cbInfo.Env().Undefined());
      sqlite3_reset(self->stmt_);
      if (rc != SQLITE_DONE) {
        InfinityBinder::ThrowSqliteError(cbInfo.Env(), self->db_, rc);
      }
    }
    return result;
  });
  iterator.Set("next", nextFn);
  iterator.Set(Napi::Symbol::WellKnown(env, "iterator"), Napi::Function::New(env, [](const Napi::CallbackInfo &cbInfo) {
    return cbInfo.This();
  }));
  return iterator;
}

Napi::Value InfinityStatement::Pluck(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!EnsureUsable(env)) return info.This();
  bool enable = true;
  if (info.Length() > 0 && info[0].IsBoolean()) {
    enable = info[0].As<Napi::Boolean>().Value();
  }
  pluck_ = enable;
  return info.This();
}

Napi::Value InfinityStatement::ColumnNames(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!EnsureUsable(env)) return Napi::Array::New(env);
  int cols = sqlite3_column_count(stmt_);
  Napi::Array arr = Napi::Array::New(env, cols);
  for (int i = 0; i < cols; i++) {
    arr.Set(static_cast<uint32_t>(i), Napi::String::New(env, sqlite3_column_name(stmt_, i)));
  }
  return arr;
}

Napi::Value InfinityStatement::Finalize(const Napi::CallbackInfo &info) {
  if (!finalized_ && stmt_) {
    sqlite3_finalize(stmt_);
  }
  finalized_ = true;
  stmt_ = nullptr;
  return info.Env().Undefined();
}
