const { Database, InfinitySqliteError } = require("./dist/index.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error("FALLO: " + message);
  }
  console.log("OK: " + message);
}

function testConcurrentIterators() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (id INTEGER)");
  db.exec("INSERT INTO t VALUES (1),(2),(3)");
  const stmt = db.prepare("SELECT id FROM t");
  const it1 = stmt.iterate();
  it1.next();
  const it2 = stmt.iterate();
  let threw = false;
  try {
    it2.next();
  } catch (error) {
    threw = true;
  }
  assert(threw, "iterate() concurrente lanza error en vez de corromper datos");
  db.close();
}

function testEmptySqlPrepare() {
  const db = new Database(":memory:");
  let threw = false;
  try {
    db.prepare("   -- solo comentario");
  } catch (error) {
    threw = true;
    assert(!/finalized/i.test(error.message), "el mensaje ya no dice 'finalized' engañosamente");
  }
  assert(threw, "prepare() con SQL vacio/comentarios lanza error claro");
  db.close();
}

function testCloseWithPendingStatements() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (id INTEGER)");
  const stmt = db.prepare("SELECT id FROM t");
  db.close();
  assert(db.open === false, "db.open es false tras close()");
  let threw = false;
  try {
    stmt.all();
  } catch (error) {
    threw = true;
  }
  assert(threw, "un statement pendiente ya no funciona tras close()");
}

function testUnsafeIntegerPrecision() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (v)");
  const stmt = db.prepare("INSERT INTO t VALUES (?)");
  let threw = false;
  try {
    stmt.run(10000000000000002);
  } catch (error) {
    threw = true;
  }
  assert(threw, "entero unsafe como Number lanza RangeError en vez de bindear silenciosamente");
  stmt.run(9007199254740991n);
  assert(true, "BigInt sigue funcionando normalmente");
  db.close();
}

function testErrorWrapping() {
  const db = new Database(":memory:");
  let isInfinityError = false;
  try {
    db.prepare("SELECT * FROM tabla_que_no_existe");
  } catch (error) {
    isInfinityError = error instanceof InfinitySqliteError;
  }
  assert(isInfinityError, "error de prepare() es instanceof InfinitySqliteError");
  db.close();
}

function testTransactionUserErrorNotMasked() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (id INTEGER)");
  class MiErrorDeNegocio extends Error {}
  const runTx = db.transaction(() => {
    throw new MiErrorDeNegocio("regla de negocio violada");
  });
  let caught = null;
  try {
    runTx();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof MiErrorDeNegocio, "el error del usuario en transaction() no se enmascara como InfinitySqliteError");
  db.close();
}

function main() {
  testConcurrentIterators();
  testEmptySqlPrepare();
  testCloseWithPendingStatements();
  testUnsafeIntegerPrecision();
  testErrorWrapping();
  testTransactionUserErrorNotMasked();
  console.log("Todas las pruebas pasaron.");
}

main();
