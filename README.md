<div align="center">

<img src="./assets/banner.png" alt="InfinitySQLite" width="100%" style="border-radius: 10px;"/>

<br><br>

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Oswald&weight=600&pause=1000&color=8B5CF6&center=true&vCenter=true&width=600&lines=💠+InfinitySQLite;SQLite+nativo+en+C%2B%2B+para+Node.js;API+síncrona+·+FTS5+·+RTREE+·+JSON1;Sin+dependencias+de+terceros+🔷)](https://git.io/typing-svg)

<br>

<p>
  <a href="https://www.npmjs.com/package/infinitysqlite"><img src="https://img.shields.io/npm/v/infinitysqlite?style=for-the-badge&color=8B5CF6&logo=npm&logoColor=white&label=npm" alt="npm version"/></a>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A516-2FA8FF?style=for-the-badge&logo=node.js&logoColor=white" alt="Node >=16"/>
  <img src="https://img.shields.io/badge/license-MIT-6D5BFF?style=for-the-badge" alt="Licencia MIT"/>
</p>

<p>
  <a href="https://github.com/Neykoor/InfinitySQLite"><img src="https://img.shields.io/github/stars/Neykoor/InfinitySQLite?style=flat-square&color=8B5CF6&logo=github" alt="Stars"/></a>
  <a href="https://github.com/Neykoor/InfinitySQLite"><img src="https://img.shields.io/github/forks/Neykoor/InfinitySQLite?style=flat-square&color=8B5CF6&logo=github" alt="Forks"/></a>
  <a href="https://github.com/Neykoor/InfinitySQLite"><img src="https://img.shields.io/github/repo-size/Neykoor/InfinitySQLite?style=flat-square&color=8B5CF6" alt="Size"/></a>
  <img src="https://img.shields.io/badge/TypeScript-typings%20incluidos-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript typings"/>
</p>

</div>

---

> [!NOTE]
> **InfinitySQLite** es un binding nativo de SQLite3 para Node.js escrito en C++ (N-API), con implementación propia y sin depender de `better-sqlite3` ni de otros wrappers de terceros. No es un cliente de WhatsApp ni tiene relación con Baileys: es la capa de almacenamiento embebido pensada para integrarse en ese tipo de proyectos (y en cualquier otro que necesite SQLite síncrono y portable).

> [!WARNING]
> El SQLite incluido (`deps/sqlite3/sqlite3.c`) se compila junto al addon nativo. Si tu plataforma no tiene un prebuild publicado, la instalación depende de que tu entorno tenga un toolchain de compilación C++ disponible (ver [Solución de problemas](#-solución-de-problemas)).

## 📋 Tabla de Contenidos

- [💠 ¿Para qué sirve?](#-para-qué-sirve)
- [🧭 Hacia dónde se dirige](#-hacia-dónde-se-dirige)
- [🧩 Arquitectura del proyecto](#-arquitectura-del-proyecto)
- [📥 Instalación](#-instalación)
  - [🛠️ Requisitos para compilar](#️-requisitos-para-compilar)
  - [🧱 Build de TypeScript](#-build-de-typescript)
- [🚀 Uso básico](#-uso-básico)
- [📜 Prepared Statements](#-prepared-statements)
- [🔁 Transacciones anidadas](#-transacciones-anidadas)
- [📬 Cola serial de tareas (`queue`)](#-cola-serial-de-tareas-queue)
- [🧮 Funciones y agregaciones personalizadas](#-funciones-y-agregaciones-personalizadas)
- [💾 Backup, checkpoint y serialización](#-backup-checkpoint-y-serialización)
- [⚠️ Manejo de errores](#️-manejo-de-errores)
- [⏱️ Busy timeout](#️-busy-timeout)
- [🧯 Solución de problemas](#-solución-de-problemas)
- [📦 Estructura de carpetas](#-estructura-de-carpetas)
- [📣 Licencia](#-licencia)

## 💠 ¿Para qué sirve?

SQLite embebido, síncrono y con control total de la capa nativa. Concretamente resuelve:

- 🔷 **API síncrona real** (`prepare().get()/.all()/.run()`), igual que `better-sqlite3`, para lecturas/escrituras de estado que no necesitan el overhead de una API async: permisos, cooldowns, cache de metadata, contadores.
- 🟣 **Cero dependencia de binarios de terceros**: el amalgamation de SQLite se compila junto al addon, así que no hay versión de SQLite "que te tocó" según el paquete que instalaste.
- 💠 **Extensiones SQLite habilitadas de fábrica**: FTS5, RTREE, JSON1 y funciones matemáticas, definidas directamente en `binding.gyp`.
- 🔵 **Portabilidad sin toolchain de compilación**: prebuilds para `linux-x64`, `linux-arm64`, `linuxmusl-x64` (Alpine), `darwin-x64`, `darwin-arm64` y `win32-x64`, generados vía GitHub Actions. Si tu plataforma está cubierta, `npm install` no necesita `python3`/`build-essential` en el host destino.
- 🟪 **Transacciones anidadas** (savepoints automáticos), `checkpoint`, `backup`, `serialize`/`deserialize` y registro de funciones/agregaciones custom — cosas que en una app con mucho estado local se terminan necesitando tarde o temprano.

<details>
<summary><strong>🧭 Ver detalles de compilación nativa</strong></summary>

| Área | Detalle |
| --- | --- |
| `binding.gyp` | Define `SQLITE_ENABLE_FTS5`, `SQLITE_ENABLE_RTREE`, `SQLITE_ENABLE_JSON1`, `SQLITE_ENABLE_MATH_FUNCTIONS` y `SQLITE_THREADSAFE=1`, entre otras. |
| Estándar C++ | `c++17` en todas las plataformas (`cflags_cc`, `xcode_settings`, `msvs_settings`). |
| Excepciones | `NAPI_DISABLE_CPP_EXCEPTIONS` a nivel N-API, `-fexceptions` habilitado a nivel de compilador para el código propio. |
| Prebuilds | Generados con `prebuildify --napi --strip -t 20.0.0` y publicados junto al paquete en npm (`npm publish --provenance`). |

</details>

## 🧭 Hacia dónde se dirige

El proyecto está orientado a aplicaciones con muchos procesos livianos corriendo en simultáneo (por ejemplo, hosting tipo Pterodactyl con varios sub-bots), donde cada instancia necesita su propio almacenamiento embebido, liviano y confiable, sin arrastrar un motor de base de datos externo.

Encaja directamente con el tipo de estado que ese tipo de aplicaciones maneja: economía y progresión (balances, streaks, cooldowns), metadata cacheada localmente, tokens/sesiones de sub-procesos, y progreso reanudable de tareas largas (scans, generación de contenido). Los prebuilds multiplataforma (incluyendo musl) apuntan específicamente a que un despliegue con decenas de instancias simultáneas no dependa de compilar en cada una.

Apps que ya usan `better-sqlite3` hoy pueden migrar con cambios mínimos, dado que la API pública sigue el mismo patrón (`prepare`/`exec`/`transaction`).

## 🧩 Arquitectura del proyecto

| Elemento | Descripción |
| --- | --- |
| **Runtime** | Node.js `>=16.0.0`. |
| **Entrada principal** | `dist/index.js` (compilado desde `ts/index.ts`). |
| **Tipados** | `dist/index.d.ts`, generados desde `ts/`. |
| **Addon nativo** | `src/` (C++ vía N-API), amalgamation de SQLite en `deps/sqlite3/`. |
| **Transporte** | Llamadas síncronas directas al addon nativo, sin proceso intermedio. |
| **Persistencia** | Archivo `.db` local, con soporte de modo `:memory:` y `readonly`. |

## 📥 Instalación

```bash
npm install infinitysqlite
```

El hook `install` (`dist/install.js`) intenta cargar un prebuild compatible con tu plataforma/arquitectura, incluyendo detección de musl (Alpine). Si no encuentra uno, corre `node-gyp rebuild` y compila desde el código fuente.

### 🛠️ Requisitos para compilar

Solo necesarios si **no** hay prebuild disponible para tu plataforma:

- Node.js >= 16
- Un compilador C++ (`build-essential` en Linux, Xcode Command Line Tools en macOS, Visual Studio Build Tools en Windows)
- Python 3.x (lo usa `node-gyp` internamente para generar los archivos de proyecto; no forma parte de la lógica de la librería)

### 🧱 Build de TypeScript

```bash
npm run build:ts
```

Genera `dist/` con el JavaScript compilado y los `.d.ts`.

## 🚀 Uso básico

```ts
import Database from "infinitysqlite";

const db = new Database("data.db");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("CREATE TABLE IF NOT EXISTS economy (jid TEXT PRIMARY KEY, wallet INTEGER NOT NULL DEFAULT 0)");

const addWallet = db.prepare(
  "INSERT INTO economy (jid, wallet) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET wallet = wallet + excluded.wallet"
);

const tx = db.transaction((entries: [string, number][]) => {
  for (const [jid, amount] of entries) addWallet.run(jid, amount);
});
tx([["5219999999999@s.whatsapp.net", 100]]);

db.close();
```

## 📜 Prepared Statements

`db.prepare(sql)` devuelve un `Statement` con los métodos habituales de una API síncrona tipo `better-sqlite3`:

```ts
const stmt = db.prepare("SELECT jid, wallet FROM economy WHERE wallet >= ?");

stmt.get(100);        // una fila o undefined
stmt.all(100);         // todas las filas que matchean
stmt.run(100);         // { changes, lastInsertRowid } — para INSERT/UPDATE/DELETE

for (const row of stmt.iterate(100)) {
  // recorre fila por fila sin materializar todo el resultado
}

stmt.pluck(true);      // devuelve solo el valor de la primera columna
stmt.columns();        // nombres de columnas del resultado
stmt.finalize();        // libera el statement explícitamente
```

## 🔁 Transacciones anidadas

`db.transaction(fn)` envuelve una función síncrona en `BEGIN`/`COMMIT` (o `SAVEPOINT`/`RELEASE` si ya hay una transacción en curso). Si `fn` lanza un error, se hace `ROLLBACK` (o `ROLLBACK TO` el savepoint correspondiente) automáticamente.

```ts
const inner = db.transaction((id: number) => {
  db.prepare("INSERT INTO t VALUES (?)").run(id);
});

const outer = db.transaction(() => {
  inner(1);
  inner(2); // si esto falla, solo se revierte hasta el savepoint de "inner"
});

outer();
```

> [!IMPORTANT]
> `transaction()` **no soporta funciones async**: si el callback devuelve una Promise, se revierte la transacción y se lanza un `InfinitySqliteError`. Para trabajo asíncrono encolado, usa `db.queue()`.

## 📬 Cola serial de tareas (`queue`)

`db.queue(fn)` envuelve una función (sync o async) en una cola FIFO: cada tarea espera a que termine la anterior antes de ejecutarse, sin importar cuál resuelva más rápido.

```ts
const task = db.queue(async (label: string, delayMs: number) => {
  await sleep(delayMs);
  console.log(label);
});

task("A", 30);
task("B", 0);
// siempre imprime "A" antes que "B", aunque B no tenga delay

db.pendingQueued; // número de tareas encoladas pendientes
```

## 🧮 Funciones y agregaciones personalizadas

```ts
db.function("double", (n: number) => n * 2, { deterministic: true });

db.aggregate("my_sum", {
  start: 0,
  step: (acc: number, value: number) => acc + value,
  deterministic: true,
});

db.prepare("SELECT double(wallet) FROM economy").all();
db.prepare("SELECT my_sum(wallet) FROM economy").get();
```

## 💾 Backup, checkpoint y serialización

```ts
db.checkpoint("FULL");           // { walPages, checkpointedPages }
db.backup("./respaldo.db");      // copia completa de la base de datos

const bytes = db.serialize();    // Buffer con la base de datos completa en memoria
db.deserialize(bytes);           // carga una base de datos desde un Buffer
```

## ⚠️ Manejo de errores

Todos los errores nativos se envuelven en `InfinitySqliteError`, con helpers para identificar el tipo de fallo sin comparar strings a mano:

```ts
import { InfinitySqliteError } from "infinitysqlite";

try {
  addWallet.run("mismo-jid", 50);
} catch (error) {
  if (error instanceof InfinitySqliteError) {
    error.isConstraintViolation;   // true si es cualquier violación de constraint
    error.isUniqueViolation;       // UNIQUE / PRIMARY KEY
    error.isForeignKeyViolation;   // FOREIGN KEY
    error.isBusy;                  // SQLITE_BUSY
  }
}
```

## ⏱️ Busy timeout

```ts
db.setBusyTimeout(2000); // ms que SQLite espera antes de lanzar SQLITE_BUSY
```

## 🧯 Solución de problemas

<details>
<summary><strong>"no se encontró ningún binario nativo compatible con esta plataforma"</strong></summary>

<br>

Si tu app corre en un hosting tipo Pterodactyl/panel VPS (Linux x64 o arm64) y al iniciar ves este error, es porque **el prebuild que trae el paquete publicado en npm no coincide con la plataforma del contenedor** (por ejemplo, el paquete puede haberse instalado sin el prebuild de `linux-x64`/`linux-arm64` disponible). Cuando eso pasa, la instalación depende por completo de que el fallback de `node-gyp rebuild` se ejecute y de que el contenedor tenga toolchain de compilación (`gcc`, `g++`, `python3`, `make`).

Además, desde npm 11+/12, los scripts de instalación (`preinstall`/`install`/`postinstall`) de las dependencias **se bloquean por defecto** salvo que estén declarados en el campo `allowScripts` de tu `package.json`. Si el script de instalación de InfinitySQLite queda bloqueado, ese fallback de compilación nunca corre, y la app falla al iniciar aunque el toolchain esté disponible.

**Si estás integrando InfinitySQLite en tu proyecto, agrega esto a tu `package.json`:**

```json
{
  "dependencies": {
    "infinitysqlite": "1.3.10"
  },
  "allowScripts": {
    "infinitysqlite": true
  }
}
```

- Fija siempre una versión exacta (no `"latest"`) para evitar que dos instalaciones "idénticas" terminen resolviendo paquetes distintos.
- Confirma que el contenedor donde corre tu app tenga `gcc`/`g++`/`python3`/`make` instalados, como respaldo por si no hay prebuild para esa plataforma.
- Puedes diagnosticar rápido con:
  ```js
  console.log(process.platform, process.arch);
  console.log(require("fs").readdirSync("node_modules/infinitysqlite/prebuilds"));
  ```

</details>

## 📦 Estructura de carpetas

```
src/        → addon nativo en C++ (database.cpp, statement.cpp, binder.cpp, addon.cpp)
deps/sqlite3/  → amalgamation oficial de SQLite (dominio público)
ts/         → capa TypeScript pública (Database, Statement, errores, cola de tareas)
binding.gyp → configuración de compilación nativa
.github/workflows/prebuilds.yml → generación y publicación de binarios prebuildeados por plataforma
```

## 📣 Licencia

<p align="center">
  <a href="https://github.com/Neykoor">
    <img src="https://github.com/Neykoor.png" width="100px" alt="Neykoor"/>
  </a>
  <br>
  <sub><b>Neykoor</b></sub>
</p>

Distribuido bajo licencia **MIT**. Consulta el archivo `LICENSE` del repositorio para el texto completo.

