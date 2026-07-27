{
  "targets": [
    {
      "target_name": "infinitysqlite",
      "sources": [
        "src/addon.cpp",
        "src/database.cpp",
        "src/statement.cpp",
        "src/binder.cpp",
        "deps/sqlite3/sqlite3.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "deps/sqlite3"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "SQLITE_THREADSAFE=1",
        "SQLITE_ENABLE_FTS5",
        "SQLITE_ENABLE_RTREE",
        "SQLITE_ENABLE_JSON1",
        "SQLITE_DEFAULT_MEMSTATUS=0",
        "SQLITE_ENABLE_MATH_FUNCTIONS",
        "SQLITE_LIKE_DOESNT_MATCH_BLOBS",
        "SQLITE_MAX_EXPR_DEPTH=0",
        "SQLITE_OMIT_DEPRECATED",
        "SQLITE_OMIT_SHARED_CACHE",
        "SQLITE_USE_ALLOCA",
        "HAVE_USLEEP=1"
      ],
      "cflags_cc": ["-std=c++17", "-fexceptions"],
      "cflags_c": ["-w"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": ["/std:c++17"]
        }
      },
      "conditions": [
        ["OS=='linux'", { "libraries": ["-ldl", "-lpthread"] }]
      ]
    }
  ]
}
