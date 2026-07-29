const { Database, InfinitySqliteError } = require("./dist/index.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error("FALLO: " + message);
  }
  console.log("OK: " + message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function testNestedTransactions() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (id INTEGER)");
  const inner = db.transaction((id) => {
    db.prepare("INSERT INTO t VALUES (?)").run(id);
  });
  const outer = db.transaction(() => {
    inner(1);
    inner(2);
  });
  outer();
  const rows = db.prepare("SELECT id FROM t ORDER BY id").all();
  assert(rows.length === 2, "transaction() anidada con savepoints inserta ambas filas");
  db.close();
}

function testNestedTransactionRollback() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (id INTEGER)");
  const inner = db.transaction((id) => {
    db.prepare("INSERT INTO t VALUES (?)").run(id);
    if (id === 2) throw new Error("falla intencional");
  });
  const outer = db.transaction(() => {
    inner(1);
    try {
      inner(2);
    } catch {
    }
  });
  outer();
  const rows = db.prepare("SELECT id FROM t ORDER BY id").all();
  assert(rows.length === 1 && rows[0].id === 1, "rollback de savepoint interno no afecta la fila del savepoint externo");
  db.close();
}

async function testSerializeQueueOrder() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (v INTEGER)");
  const order = [];
  const task = db.queue(async (label, delay) => {
    await sleep(delay);
    order.push(label);
  });
  const p1 = task("A", 30);
  const p2 = task("B", 0);
  await Promise.all([p1, p2]);
  assert(order.join(",") === "A,B", "queue() respeta el orden de encolado aunque B sea mas rapido");
  assert(db.pendingQueued === 0, "pendingQueued vuelve a 0 tras vaciar la cola");
  db.close();
}

function testSetBusyTimeout() {
  const db = new Database(":memory:");
  let threw = false;
  try {
    db.setBusyTimeout(-1);
  } catch {
    threw = true;
  }
  assert(threw, "setBusyTimeout(-1) lanza error en vez de aceptar un valor invalido");
  db.setBusyTimeout(2000);
  assert(true, "setBusyTimeout(2000) no lanza con un valor valido");
  db.close();
}

function testUniqueConstraintTyped() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (jid TEXT PRIMARY KEY)");
  db.prepare("INSERT INTO t VALUES (?)").run("user1");
  let caught = null;
  try {
    db.prepare("INSERT INTO t VALUES (?)").run("user1");
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof InfinitySqliteError, "violacion de UNIQUE sigue siendo InfinitySqliteError");
  assert(caught.isUniqueViolation === true, "caught.isUniqueViolation detecta el duplicado sin parsear el mensaje");
  db.close();
}

function testForeignKeyConstraintTyped() {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE parent (id INTEGER PRIMARY KEY)");
  db.exec("CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))");
  let caught = null;
  try {
    db.prepare("INSERT INTO child (id, parent_id) VALUES (1, 999)").run();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof InfinitySqliteError, "violacion de FOREIGN KEY sigue siendo InfinitySqliteError");
  assert(caught.isForeignKeyViolation === true, "caught.isForeignKeyViolation detecta la referencia rota");
  db.close();
}

function testCustomFunction() {
  const db = new Database(":memory:");
  db.function("gacha_weight", (rarity) => 1 / Math.pow(2, rarity), { deterministic: true });
  db.exec("CREATE TABLE cards (id INTEGER, rarity INTEGER)");
  db.exec("INSERT INTO cards VALUES (1, 1), (2, 3)");
  const rows = db.prepare("SELECT id, gacha_weight(rarity) AS w FROM cards ORDER BY id").all();
  assert(rows[0].w === 0.5, "db.function() calcula gacha_weight(1) = 0.5 desde SQL");
  assert(rows[1].w === 0.125, "db.function() calcula gacha_weight(3) = 0.125 desde SQL");
  db.close();
}

function testCustomFunctionErrorPropagates() {
  const db = new Database(":memory:");
  db.function("explota", () => {
    throw new Error("boom desde JS");
  });
  db.exec("CREATE TABLE t (id INTEGER)");
  db.exec("INSERT INTO t VALUES (1)");
  let threw = false;
  try {
    db.prepare("SELECT explota() FROM t").all();
  } catch {
    threw = true;
  }
  assert(threw, "un error lanzado dentro de db.function() se propaga como error SQL, no crashea el proceso");
  db.close();
}

function testAggregateBasic() {
  const db = new Database(":memory:");
  db.aggregate("sum_weighted", {
    start: 0,
    step: (acc, weight) => acc + weight,
  });
  db.exec("CREATE TABLE pulls (rarity_weight REAL)");
  db.exec("INSERT INTO pulls VALUES (0.5), (0.25), (0.125)");
  const row = db.prepare("SELECT sum_weighted(rarity_weight) AS total FROM pulls").get();
  assert(row.total === 0.875, "db.aggregate() acumula el step() sobre todas las filas");
  db.close();
}

function testAggregateWithResult() {
  const db = new Database(":memory:");
  db.aggregate("gacha_ev", {
    start: 0,
    step: (acc, weight) => acc + weight,
    result: (acc) => Math.round(acc * 1000) / 1000,
  });
  db.exec("CREATE TABLE pulls (rarity_weight REAL)");
  db.exec("INSERT INTO pulls VALUES (0.3333), (0.3333)");
  const row = db.prepare("SELECT gacha_ev(rarity_weight) AS total FROM pulls").get();
  assert(row.total === 0.667, "result() transforma el acumulador final antes de devolverlo a SQL");
  db.close();
}

function testAggregateEmptyGroup() {
  const db = new Database(":memory:");
  db.aggregate("sum_weighted", {
    start: 0,
    step: (acc, weight) => acc + weight,
  });
  db.exec("CREATE TABLE pulls (rarity_weight REAL)");
  const row = db.prepare("SELECT sum_weighted(rarity_weight) AS total FROM pulls").get();
  assert(row.total === 0, "sin filas, el agregado devuelve el start() sin llamar step()");
  db.close();
}

function testAggregateGroupBy() {
  const db = new Database(":memory:");
  db.aggregate("sum_weighted", {
    start: 0,
    step: (acc, weight) => acc + weight,
  });
  db.exec("CREATE TABLE pulls (session_id TEXT, rarity_weight REAL)");
  db.exec("INSERT INTO pulls VALUES ('a', 1), ('a', 2), ('b', 10)");
  const rows = db.prepare("SELECT session_id, sum_weighted(rarity_weight) AS total FROM pulls GROUP BY session_id ORDER BY session_id").all();
  assert(rows[0].total === 3 && rows[1].total === 10, "el acumulador se resetea por cada grupo de GROUP BY");
  db.close();
}

function testAggregateStepErrorPropagates() {
  const db = new Database(":memory:");
  db.aggregate("explota_agg", {
    start: 0,
    step: () => {
      throw new Error("boom en step");
    },
  });
  db.exec("CREATE TABLE t (v INTEGER)");
  db.exec("INSERT INTO t VALUES (1)");
  let threw = false;
  try {
    db.prepare("SELECT explota_agg(v) FROM t").get();
  } catch {
    threw = true;
  }
  assert(threw, "un error lanzado dentro de step() se propaga como error SQL, no crashea el proceso");
  db.close();
}

function testCheckpoint() {
  const path = require("path").join(require("os").tmpdir(), `infinitysqlite-checkpoint-${Date.now()}.sqlite`);
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("CREATE TABLE t (v TEXT)");
  db.prepare("INSERT INTO t VALUES (?)").run("dato");
  const result = db.checkpoint("TRUNCATE");
  assert(typeof result.walPages === "number" && typeof result.checkpointedPages === "number", "checkpoint() devuelve walPages y checkpointedPages numericos");
  db.close();
  require("fs").rmSync(path, { force: true });
  require("fs").rmSync(path + "-wal", { force: true });
  require("fs").rmSync(path + "-shm", { force: true });
}

function testBackup() {
  const os = require("os");
  const path = require("path");
  const fs = require("fs");
  const srcPath = path.join(os.tmpdir(), `infinitysqlite-src-${Date.now()}.sqlite`);
  const destPath = path.join(os.tmpdir(), `infinitysqlite-dest-${Date.now()}.sqlite`);
  const db = new Database(srcPath);
  db.exec("CREATE TABLE t (v TEXT)");
  db.prepare("INSERT INTO t VALUES (?)").run("respaldado");
  db.backup(destPath);
  db.close();

  const restored = new Database(destPath);
  const row = restored.prepare("SELECT v FROM t").get();
  assert(row.v === "respaldado", "backup() produce un archivo con los mismos datos que el original");
  restored.close();

  fs.rmSync(srcPath, { force: true });
  fs.rmSync(destPath, { force: true });
}

function testSerializeDeserialize() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
  db.prepare("INSERT INTO t (v) VALUES (?)").run("uno");
  db.prepare("INSERT INTO t (v) VALUES (?)").run("dos");

  const dump = db.serialize();
  assert(Buffer.isBuffer(dump) && dump.length > 0, "serialize() devuelve un Buffer con contenido");
  db.close();

  const restored = new Database(":memory:");
  restored.deserialize(dump);
  const rows = restored.prepare("SELECT v FROM t ORDER BY id").all();
  assert(rows.length === 2 && rows[0].v === "uno" && rows[1].v === "dos", "deserialize() reconstruye exactamente las mismas filas");
  restored.prepare("INSERT INTO t (v) VALUES (?)").run("tres");
  const afterInsert = restored.prepare("SELECT COUNT(*) AS c FROM t").get();
  assert(afterInsert.c === 3, "la DB deserializada sigue siendo escribible normalmente");
  restored.close();
}

async function main() {
  testNestedTransactions();
  testNestedTransactionRollback();
  await testSerializeQueueOrder();
  testSetBusyTimeout();
  testUniqueConstraintTyped();
  testForeignKeyConstraintTyped();
  testCustomFunction();
  testCustomFunctionErrorPropagates();
  testAggregateBasic();
  testAggregateWithResult();
  testAggregateEmptyGroup();
  testAggregateGroupBy();
  testAggregateStepErrorPropagates();
  testCheckpoint();
  testBackup();
  testSerializeDeserialize();
  console.log("Todas las pruebas nuevas pasaron.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
