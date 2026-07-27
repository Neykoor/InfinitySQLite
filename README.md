# InfinitySQLite

Binding nativo de SQLite3 para Node.js, implementación propia en C++ (N-API) con capa TypeScript/JavaScript.

## Requisitos para compilar

- Node.js >= 16
- Un compilador C++ (build-essential en Linux, Xcode Command Line Tools en macOS, o Visual Studio Build Tools en Windows)
- Python 3.x

Python no forma parte de la lógica de la librería. `node-gyp`, la herramienta que invoca el proceso de compilación de código nativo (`gyp`), depende de Python internamente para generar los archivos de proyecto (Makefiles/MSBuild/Xcode) antes de llamar al compilador de C++. El binding en sí está escrito completamente en C++, TypeScript y JavaScript.

## Instalación

```
npm install
```

Esto ejecuta automáticamente `node-gyp rebuild` (hook de `install`), compilando `src/*.cpp` junto al amalgamation de SQLite (`deps/sqlite3/sqlite3.c`, dominio público) en `build/Release/infinitysqlite.node`.

## Build de TypeScript

```
npm run build:ts
```

Genera `dist/` con el JavaScript compilado y los `.d.ts`.

## Uso

```ts
import Database from "InfinitySQLite";

const db = new Database("data.db");
db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)");

const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
insert.run("Ney");

const getAll = db.prepare("SELECT * FROM users");
console.log(getAll.all());

const tx = db.transaction((names: string[]) => {
  for (const name of names) insert.run(name);
});
tx(["A", "B", "C"]);

db.close();
```

## Estructura

- `src/` — addon nativo en C++ (database.cpp, statement.cpp, binder.cpp, addon.cpp)
- `deps/sqlite3/` — amalgamation oficial de SQLite (dominio público)
- `ts/` — capa TypeScript pública (Database, Statement, errores)
- `binding.gyp` — configuración de compilación nativa
