#include "binder.h"
#include <cstring>
#include <cmath>

namespace InfinityBinder {

const double kMaxSafeInteger = 9007199254740991.0;
const double kMinSafeInteger = -9007199254740991.0;

void BindValue(Napi::Env env, sqlite3_stmt *stmt, int index, const Napi::Value &value) {
  if (value.IsNull() || value.IsUndefined()) {
    sqlite3_bind_null(stmt, index);
    return;
  }
  if (value.IsNumber()) {
    double d = value.As<Napi::Number>().DoubleValue();
    if (std::isnan(d) || std::isinf(d)) {
      sqlite3_bind_double(stmt, index, d);
      return;
    }
    bool isIntegerValued = d == std::floor(d);
    if (isIntegerValued) {
      if (d > kMaxSafeInteger || d < kMinSafeInteger) {
        Napi::RangeError::New(env, "Integer value is unsafe for JS Number precision; pass a BigInt instead").ThrowAsJavaScriptException();
        return;
      }
      sqlite3_bind_int64(stmt, index, static_cast<int64_t>(d));
    } else {
      sqlite3_bind_double(stmt, index, d);
    }
    return;
  }
  if (value.IsBigInt()) {
    bool lossless;
    int64_t v = value.As<Napi::BigInt>().Int64Value(&lossless);
    if (!lossless) {
      Napi::RangeError::New(env, "BigInt value is out of range for a 64-bit SQLite integer").ThrowAsJavaScriptException();
      return;
    }
    sqlite3_bind_int64(stmt, index, v);
    return;
  }
  if (value.IsBoolean()) {
    sqlite3_bind_int(stmt, index, value.As<Napi::Boolean>().Value() ? 1 : 0);
    return;
  }
  if (value.IsBuffer()) {
    Napi::Buffer<uint8_t> buf = value.As<Napi::Buffer<uint8_t>>();
    sqlite3_bind_blob(stmt, index, buf.Data(), static_cast<int>(buf.Length()), SQLITE_TRANSIENT);
    return;
  }
  if (value.IsString()) {
    std::string s = value.As<Napi::String>().Utf8Value();
    sqlite3_bind_text(stmt, index, s.c_str(), static_cast<int>(s.size()), SQLITE_TRANSIENT);
    return;
  }
  Napi::TypeError::New(env, "Unsupported bind value type").ThrowAsJavaScriptException();
}

Napi::Value ColumnToValue(Napi::Env env, sqlite3_stmt *stmt, int column) {
  int type = sqlite3_column_type(stmt, column);
  switch (type) {
    case SQLITE_INTEGER: {
      sqlite3_int64 v = sqlite3_column_int64(stmt, column);
      if (v > 9007199254740992LL || v < -9007199254740992LL) {
        return Napi::BigInt::New(env, static_cast<int64_t>(v));
      }
      return Napi::Number::New(env, static_cast<double>(v));
    }
    case SQLITE_FLOAT:
      return Napi::Number::New(env, sqlite3_column_double(stmt, column));
    case SQLITE_TEXT: {
      const unsigned char *text = sqlite3_column_text(stmt, column);
      int len = sqlite3_column_bytes(stmt, column);
      return Napi::String::New(env, reinterpret_cast<const char *>(text), len);
    }
    case SQLITE_BLOB: {
      const void *blob = sqlite3_column_blob(stmt, column);
      int len = sqlite3_column_bytes(stmt, column);
      Napi::Buffer<uint8_t> buf = Napi::Buffer<uint8_t>::New(env, len);
      if (len > 0) std::memcpy(buf.Data(), blob, len);
      return buf;
    }
    case SQLITE_NULL:
    default:
      return env.Null();
  }
}

const char *ErrorCodeName(int code) {
  switch (code) {
    case SQLITE_CONSTRAINT_UNIQUE: return "SQLITE_CONSTRAINT_UNIQUE";
    case SQLITE_CONSTRAINT_PRIMARYKEY: return "SQLITE_CONSTRAINT_PRIMARYKEY";
    case SQLITE_CONSTRAINT_FOREIGNKEY: return "SQLITE_CONSTRAINT_FOREIGNKEY";
    case SQLITE_CONSTRAINT_NOTNULL: return "SQLITE_CONSTRAINT_NOTNULL";
    case SQLITE_CONSTRAINT_CHECK: return "SQLITE_CONSTRAINT_CHECK";
    case SQLITE_CONSTRAINT_TRIGGER: return "SQLITE_CONSTRAINT_TRIGGER";
    case SQLITE_CONSTRAINT_VTAB: return "SQLITE_CONSTRAINT_VTAB";
    case SQLITE_CONSTRAINT_ROWID: return "SQLITE_CONSTRAINT_ROWID";
    case SQLITE_CONSTRAINT_PINNED: return "SQLITE_CONSTRAINT_PINNED";
    case SQLITE_CONSTRAINT: return "SQLITE_CONSTRAINT";
    case SQLITE_BUSY_TIMEOUT: return "SQLITE_BUSY_TIMEOUT";
    case SQLITE_BUSY_RECOVERY: return "SQLITE_BUSY_RECOVERY";
    case SQLITE_BUSY_SNAPSHOT: return "SQLITE_BUSY_SNAPSHOT";
    case SQLITE_BUSY: return "SQLITE_BUSY";
    case SQLITE_LOCKED_SHAREDCACHE: return "SQLITE_LOCKED_SHAREDCACHE";
    case SQLITE_LOCKED: return "SQLITE_LOCKED";
    case SQLITE_READONLY: return "SQLITE_READONLY";
    case SQLITE_IOERR: return "SQLITE_IOERR";
    case SQLITE_CORRUPT: return "SQLITE_CORRUPT";
    case SQLITE_FULL: return "SQLITE_FULL";
    case SQLITE_MISMATCH: return "SQLITE_MISMATCH";
    default: return "SQLITE_ERROR";
  }
}

void ThrowSqliteError(Napi::Env env, sqlite3 *db, int code) {
  const char *msg = sqlite3_errmsg(db);
  Napi::Error err = Napi::Error::New(env, msg ? msg : "SQLite error");
  err.Set("code", Napi::Number::New(env, code));
  err.Set("type", Napi::String::New(env, ErrorCodeName(code)));
  err.ThrowAsJavaScriptException();
}

}
