# InfinitySQLite

Binding nativo de SQLite3 para Node.js. Implementación propia en C++ (N-API), sin depender de `better-sqlite3` ni de otros wrappers de terceros, con una capa pública en TypeScript/JavaScript.

## ¿Para qué sirve?

SQLite embebido, síncrono y con control total de la capa nativa. Concretamente resuelve:

- **API síncrona real** (`prepare().get()/.all()/.run()`), igual que `better-sqlite3`, para lecturas/escrituras de estado que no necesitan (ni quieren) el overhead de una API async — permisos, cooldowns, cache de metadata, contadores.
- **Cero dependencia de binarios de terceros**: el amalgamation de SQLite (`deps/sqlite3/sqlite3.c`) se compila junto al addon, así que no hay versión de SQLite "que te tocó" según el paquete que instalaste.
- **Extensiones SQLite habilitadas de fábrica**: FTS5, RTREE, JSON1 y funciones matemáticas, definidas directamente en `binding.gyp`.
- **Portabilidad sin toolchain de compilación**: prebuilds para `linux-x64`, `linux-arm64`, `linuxmusl-x64` (Alpine), `darwin-x64/arm64` y `win32-x64`, generados vía GitHub Actions. Si tu plataforma está cubierta, `npm install` no necesita `python3`/`build-essential` en el host destino.
- **Transacciones anidadas** (savepoints automáticos), `checkpoint`, `backup` y registro de funciones custom (`registerFunction`) — cosas que en un bot con mucho estado local se terminan necesitando tarde o temprano.

## Hacia dónde se dirige

El proyecto está orientado a proyectos de bots de WhatsApp: bots de un solo proceso con muchos sub-bots corriendo en simultáneo (hosting tipo Pterodactyl), donde cada instancia necesita su propio almacenamiento embebido, liviano y confiable, sin arrastrar un motor de base de datos externo.

Encaja directamente con el tipo de estado que este tipo de bots maneja: economía y gacha (balances, streaks, cooldowns), metadata de grupos y stickers cacheada localmente, tokens/sesiones de sub-bots, y progreso reanudable de tareas largas (scans, generación de contenido). Los prebuilds multiplataforma (incluyendo musl) apuntan específicamente a que un despliegue con decenas de instancias simultáneas no dependa de compilar en cada una.

Es la pieza de almacenamiento pensada para integrarse en ese ecosistema — bots como los que ya usan `better-sqlite3` hoy pueden migrar con cambios mínimos, dado que la API pública sigue el mismo patrón (`prepare`/`exec`/`transaction`).

## Requisitos para compilar (solo si no hay prebuild para tu plataforma)

- Node.js >= 16
- Un compilador C++ (`build-essential` en Linux, Xcode Command Line Tools en macOS, Visual Studio Build Tools en Windows)
- Python 3.x (lo usa `node-gyp` internamente para generar los archivos de proyecto; no forma parte de la lógica de la librería)

## Instalación

```
npm install
```

El hook `install` intenta cargar un prebuild compatible con tu plataforma/arquitectura (incluyendo detección de musl). Si no encuentra uno, corre `node-gyp rebuild` y compila desde fuente.

## Build de TypeScript

```
npm run build:ts
```

Genera `dist/` con el JavaScript compilado y los `.d.ts`.

## Uso

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

## Estructura

- `src/` — addon nativo en C++ (`database.cpp`, `statement.cpp`, `binder.cpp`, `addon.cpp`)
- `deps/sqlite3/` — amalgamation oficial de SQLite (dominio público)
- `ts/` — capa TypeScript pública (`Database`, `Statement`, errores, cola de tareas)
- `binding.gyp` — configuración de compilación nativa
- `.github/workflows/prebuilds.yml` — generación y publicación de binarios prebuildeados por plataforma
- 
