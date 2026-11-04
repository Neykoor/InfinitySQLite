#include <napi.h>
#include "database.h"
#include "statement.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  exports.Set("InfinityDatabase", InfinityDatabase::GetClass(env));
  InfinityStatement::GetClass(env);
  return exports;
}

NODE_API_MODULE(infinitysqlite, InitAll)
