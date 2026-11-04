const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Database, InfinitySqliteError } = require("../dist/index.js");

function memoryDb() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, score REAL)");
  return db;
}

test("run devuelve changes y lastInsertRowid", () => {
  const db = memoryDb();
  const result = db.prepare("INSERT INTO users (name, score) VALUES (?, ?)").run("ana", 1.5);
  assert.equal(result.changes, 1);
  assert.equal(Number(result.lastInsertRowid), 1);
  db.close();
});

test("get, all y pluck", () => {
  const db = memoryDb();
  const insert = db.prepare("INSERT INTO users (name, score) VALUES (?, ?)");
  insert.run("ana", 1);
  insert.run("luis", 2);
  assert.deepEqual(db.prepare("SELECT name FROM users WHERE id = ?").get(1), { name: "ana" });
  assert.equal(db.prepare("SELECT name FROM users WHERE id = ?").get(99), undefined);
  assert.equal(db.prepare("SELECT * FROM users").all().length, 2);
  assert.deepEqual(db.prepare("SELECT name FROM users ORDER BY id").pluck().all(), ["ana", "luis"]);
  db.close();
});

test("parametros con nombre", () => {
  const db = memoryDb();
  db.prepare("INSERT INTO users (name, score) VALUES (@name, @score)").run({ name: "ana", score: 3 });
  assert.equal(db.prepare("SELECT score FROM users").pluck().get(), 3);
  db.close();
});

test("columns devuelve los nombres de columna", () => {
  const db = memoryDb();
  assert.deepEqual(db.prepare("SELECT id, name FROM users").columns(), ["id", "name"]);
  db.close();
});

test("iterate recorre las filas", () => {
  const db = memoryDb();
  db.exec("INSERT INTO users (name) VALUES ('a'),('b'),('c')");
  const names = [];
  for (const row of db.prepare("SELECT name FROM users ORDER BY id").iterate()) names.push(row.name);
  assert.deepEqual(names, ["a", "b", "c"]);
  db.close();
});

test("tipos: null, blob, bigint y texto unicode", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (a, b, c, d)");
  const blob = Buffer.from([1, 2, 3, 255]);
  db.prepare("INSERT INTO t VALUES (?, ?, ?, ?)").run(null, blob, 9007199254740993n, "ñandú 💠");
  const row = db.prepare("SELECT * FROM t").get();
  assert.equal(row.a, null);
  assert.deepEqual(Buffer.from(row.b), blob);
  assert.equal(BigInt(row.c), 9007199254740993n);
  assert.equal(row.d, "ñandú 💠");
  db.close();
});

test("un blob vacio se conserva como blob", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (b)");
  db.prepare("INSERT INTO t VALUES (?)").run(Buffer.alloc(0));
  const row = db.prepare("SELECT b, typeof(b) AS kind FROM t").get();
  assert.ok(Buffer.isBuffer(row.b));
  assert.equal(row.b.length, 0);
  assert.equal(row.kind, "blob");
  db.close();
});

test("transaction hace commit", () => {
  const db = memoryDb();
  const insertMany = db.transaction((names) => {
    const stmt = db.prepare("INSERT INTO users (name) VALUES (?)");
    for (const name of names) stmt.run(name);
  });
  insertMany(["a", "b", "c"]);
  assert.equal(db.prepare("SELECT COUNT(*) FROM users").pluck().get(), 3);
  db.close();
});

test("transaction hace rollback y propaga el error original", () => {
  const db = memoryDb();
  const failing = db.transaction(() => {
    db.prepare("INSERT INTO users (name) VALUES ('x')").run();
    throw new Error("boom");
  });
  assert.throws(() => failing(), (error) => error.message === "boom" && !(error instanceof InfinitySqliteError));
  assert.equal(db.prepare("SELECT COUNT(*) FROM users").pluck().get(), 0);
  db.close();
});

test("transaction hace rollback si el COMMIT falla", () => {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE parent (id INTEGER PRIMARY KEY)");
  db.exec("CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED)");
  const run = db.transaction(() => {
    db.prepare("INSERT INTO child VALUES (1, 999)").run();
  });
  assert.throws(() => run(), InfinitySqliteError);
  db.exec("BEGIN");
  db.exec("ROLLBACK");
  db.close();
});

test("transacciones anidadas usan savepoints", () => {
  const db = memoryDb();
  const inner = db.transaction(() => {
    db.prepare("INSERT INTO users (name) VALUES ('inner')").run();
    throw new Error("inner fail");
  });
  const outer = db.transaction(() => {
    db.prepare("INSERT INTO users (name) VALUES ('outer')").run();
    try {
      inner();
    } catch {
      return "recovered";
    }
  });
  assert.equal(outer(), "recovered");
  assert.deepEqual(db.prepare("SELECT name FROM users").pluck().all(), ["outer"]);
  db.close();
});

test("transaction rechaza funciones async", () => {
  const db = memoryDb();
  const bad = db.transaction(async () => {});
  assert.throws(() => bad(), InfinitySqliteError);
  db.close();
});

test("errores de SQL son InfinitySqliteError", () => {
  const db = memoryDb();
  assert.throws(() => db.prepare("SELEC nada"), InfinitySqliteError);
  assert.throws(() => db.exec("INSERT INTO no_existe VALUES (1)"), InfinitySqliteError);
  db.close();
});

test("exec tambien devuelve errores tipados", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE u (k TEXT UNIQUE)");
  db.exec("INSERT INTO u VALUES ('a')");
  assert.throws(
    () => db.exec("INSERT INTO u VALUES ('a')"),
    (error) => error instanceof InfinitySqliteError && error.isUniqueViolation
  );
  db.close();
});

test("restricciones UNIQUE lanzan error", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE u (k TEXT UNIQUE)");
  const stmt = db.prepare("INSERT INTO u VALUES (?)");
  stmt.run("a");
  assert.throws(() => stmt.run("a"), InfinitySqliteError);
  db.close();
});

test("deserialize rechaza buffers que no son SQLite", () => {
  const db = new Database(":memory:");
  assert.throws(() => db.deserialize(Buffer.from("esto no es una base sqlite")), InfinitySqliteError);
  assert.equal(db.prepare("SELECT 1").pluck().get(), 1);
  db.close();
});

test("funciones personalizadas", () => {
  const db = new Database(":memory:");
  db.function("doble", (x) => x * 2, { argCount: 1, deterministic: true });
  assert.equal(db.prepare("SELECT doble(21)").pluck().get(), 42);
  db.close();
});

test("funciones personalizadas rechazan BigInt fuera de rango", () => {
  const db = new Database(":memory:");
  db.function("big", () => 1n << 80n);
  assert.throws(() => db.prepare("SELECT big()").pluck().get(), InfinitySqliteError);
  db.close();
});

test("agregaciones personalizadas", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE n (v INTEGER)");
  db.exec("INSERT INTO n VALUES (1),(2),(3),(4)");
  db.aggregate("suma_custom", { start: 0, step: (acc, v) => acc + v, argCount: 1 });
  assert.equal(db.prepare("SELECT suma_custom(v) FROM n").pluck().get(), 10);
  db.close();
});

test("extensiones habilitadas: FTS5, JSON1 y RTREE", () => {
  const db = new Database(":memory:");
  db.exec("CREATE VIRTUAL TABLE docs USING fts5(body)");
  db.exec("INSERT INTO docs VALUES ('hola mundo nativo'), ('otro texto')");
  assert.equal(db.prepare("SELECT COUNT(*) FROM docs WHERE docs MATCH 'mundo'").pluck().get(), 1);
  assert.equal(db.prepare("SELECT json_extract('{\"a\":5}', '$.a')").pluck().get(), 5);
  db.exec("CREATE VIRTUAL TABLE r USING rtree(id, minx, maxx, miny, maxy)");
  db.exec("INSERT INTO r VALUES (1, 0, 10, 0, 10)");
  assert.equal(db.prepare("SELECT COUNT(*) FROM r WHERE minx <= 5 AND maxx >= 5").pluck().get(), 1);
  assert.ok(db.prepare("SELECT sqrt(16)").pluck().get() === 4);
  db.close();
});

test("serialize y deserialize conservan los datos", () => {
  const db = memoryDb();
  db.exec("INSERT INTO users (name) VALUES ('persistente')");
  const data = db.serialize();
  assert.ok(Buffer.isBuffer(data) && data.length > 0);
  const copy = new Database(":memory:");
  copy.deserialize(data);
  assert.equal(copy.prepare("SELECT name FROM users").pluck().get(), "persistente");
  db.close();
  copy.close();
});

test("backup, WAL y checkpoint sobre archivos reales", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "infinity-"));
  const file = path.join(dir, "main.db");
  const copyFile = path.join(dir, "copy.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE t (v INTEGER)");
  db.exec("INSERT INTO t VALUES (1),(2)");
  const result = db.checkpoint("TRUNCATE");
  assert.equal(typeof result.walPages, "number");
  db.backup(copyFile);
  db.close();
  const copy = new Database(copyFile, { readonly: true });
  assert.equal(copy.prepare("SELECT COUNT(*) FROM t").pluck().get(), 2);
  assert.throws(() => copy.exec("INSERT INTO t VALUES (3)"), InfinitySqliteError);
  copy.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("backup respeta el timeout cuando la base esta bloqueada", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "infinity-backup-lock-"));
  const file = path.join(dir, "main.db");
  const copyFile = path.join(dir, "copy.db");
  const db = new Database(file, { timeout: 100 });
  db.exec("CREATE TABLE t (v INTEGER)");
  db.exec("INSERT INTO t VALUES (1)");
  const locker = new Database(file, { timeout: 100 });
  locker.exec("BEGIN EXCLUSIVE");
  assert.throws(() => db.backup(copyFile), InfinitySqliteError);
  locker.exec("ROLLBACK");
  db.backup(copyFile);
  const copy = new Database(copyFile, { readonly: true });
  assert.equal(copy.prepare("SELECT COUNT(*) FROM t").pluck().get(), 1);
  copy.close();
  locker.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("close marca la base como cerrada", () => {
  const db = memoryDb();
  assert.equal(db.open, true);
  db.close();
  assert.equal(db.open, false);
  assert.throws(() => db.exec("SELECT 1"));
});

test("queue ejecuta las tareas en orden", async () => {
  const db = memoryDb();
  const order = [];
  const task = db.queue(async (n, delay) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    order.push(n);
    return n;
  });
  const results = await Promise.all([task(1, 30), task(2, 5), task(3, 1)]);
  assert.deepEqual(order, [1, 2, 3]);
  assert.deepEqual(results, [1, 2, 3]);
  assert.equal(db.pendingQueued, 0);
  db.close();
});

test("queue sigue funcionando despues de una tarea fallida", async () => {
  const db = memoryDb();
  const fail = db.queue(() => {
    throw new Error("fallo");
  });
  const ok = db.queue(() => "ok");
  await assert.rejects(fail(), /fallo/);
  assert.equal(await ok(), "ok");
  db.close();
});

test("worker_threads no comparten el constructor de statements", async () => {
  const { Worker } = require("node:worker_threads");
  const modulePath = require.resolve("../dist/index.js");
  const source = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { Database } = require(workerData.modulePath);
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    parentPort.postMessage("ready");
    parentPort.on("message", (message) => {
      if (message !== "run") return;
      db.prepare("INSERT INTO t VALUES (?)").run(workerData.value);
      parentPort.postMessage(db.prepare("SELECT v FROM t").pluck().get());
      db.close();
    });
  `;
  const start = (value) => new Worker(source, { eval: true, workerData: { modulePath, value } });
  const waitForMessage = (worker, expected) => new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message !== expected) return;
      worker.off("message", onMessage);
      resolve();
    };
    worker.on("message", onMessage);
    worker.once("error", reject);
  });
  const first = start(1);
  const second = start(2);
  await Promise.all([waitForMessage(first, "ready"), waitForMessage(second, "ready")]);
  const result = (worker) => new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
  });
  const firstResult = result(first);
  const secondResult = result(second);
  first.postMessage("run");
  second.postMessage("run");
  assert.deepEqual(await Promise.all([firstResult, secondResult]), [1, 2]);
  await Promise.all([first.terminate(), second.terminate()]);
});

test("parametros con nombre: prefijos :, @ y $ y reutilizacion del statement", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE p (a, b, c)");
  const insert = db.prepare("INSERT INTO p VALUES (:a, @b, $c)");
  insert.run({ a: 1, b: 2, c: 3 });
  insert.run({ c: 6, a: 4, b: 5 });
  assert.deepEqual(db.prepare("SELECT a, b, c FROM p ORDER BY a").all(), [
    { a: 1, b: 2, c: 3 },
    { a: 4, b: 5, c: 6 },
  ]);
  db.close();
});

test("parametro con nombre desconocido lanza error", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE p (a)");
  const insert = db.prepare("INSERT INTO p VALUES (:a)");
  assert.throws(() => insert.run({ a: 1, zzz: 2 }), /Unknown named parameter: zzz/);
  db.close();
});

test("parametros no provistos se bindean como NULL", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE p (a, b)");
  db.prepare("INSERT INTO p VALUES (:a, :b)").run({ a: 1 });
  db.prepare("INSERT INTO p VALUES (?, ?)").run(2);
  assert.deepEqual(db.prepare("SELECT a, b FROM p ORDER BY a").all(), [
    { a: 1, b: null },
    { a: 2, b: null },
  ]);
  db.close();
});

test("los nombres de columna se actualizan si el esquema cambia", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE s (a INTEGER)");
  db.exec("INSERT INTO s VALUES (1)");
  const select = db.prepare("SELECT * FROM s");
  assert.deepEqual(select.get(), { a: 1 });
  db.exec("ALTER TABLE s ADD COLUMN b INTEGER DEFAULT 7");
  assert.deepEqual(select.get(), { a: 1, b: 7 });
  assert.deepEqual(select.all(), [{ a: 1, b: 7 }]);
  db.close();
});

test("alias de columna y columnas duplicadas", () => {
  const db = new Database(":memory:");
  assert.deepEqual(db.prepare("SELECT 1 AS uno, 'x' AS letra").get(), { uno: 1, letra: "x" });
  assert.deepEqual(db.prepare("SELECT 1 AS k, 2 AS k").get(), { k: 2 });
  db.close();
});

test("run repetido mantiene la forma del resultado", () => {
  const db = memoryDb();
  const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
  for (let i = 1; i <= 3; i++) {
    const result = insert.run("u" + i);
    assert.deepEqual(Object.keys(result), ["changes", "lastInsertRowid"]);
    assert.equal(Number(result.lastInsertRowid), i);
  }
  db.close();
});

test("opcion performance aplica WAL y synchronous NORMAL en disco", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "infinity-perf-"));
  const db = new Database(path.join(dir, "perf.db"), { performance: true });
  assert.equal(String(db.pragma("journal_mode")).toLowerCase().includes("wal"), true);
  db.exec("CREATE TABLE t (v)");
  db.exec("INSERT INTO t VALUES (1)");
  assert.equal(db.prepare("SELECT COUNT(*) FROM t").pluck().get(), 1);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("opcion performance se ignora en :memory: y readonly", () => {
  const memory = new Database(":memory:", { performance: true });
  memory.exec("CREATE TABLE t (v)");
  memory.close();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "infinity-ro-"));
  const file = path.join(dir, "ro.db");
  const writer = new Database(file);
  writer.exec("CREATE TABLE t (v)");
  writer.close();
  const reader = new Database(file, { readonly: true, performance: true });
  assert.equal(reader.prepare("SELECT COUNT(*) FROM t").pluck().get(), 0);
  reader.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
