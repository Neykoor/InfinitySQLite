const { performance } = require("node:perf_hooks");
const { Database: InfinityDatabase } = require("../dist/index.js");

const ROWS = Number(process.env.ROWS || 100000);
const ROUNDS = Number(process.env.ROUNDS || 5);

function tryLoad(name, load) {
  try {
    return { name, create: load() };
  } catch {
    return null;
  }
}

const adapters = [
  tryLoad("infinitysqlite", () => (file) => {
    const db = new InfinityDatabase(file);
    return {
      exec: (sql) => db.exec(sql),
      prepare: (sql) => db.prepare(sql),
      transaction: (fn) => db.transaction(fn),
      close: () => db.close(),
    };
  }),
  tryLoad("better-sqlite3", () => {
    const BetterSqlite3 = require("better-sqlite3");
    return (file) => {
      const db = new BetterSqlite3(file);
      return {
        exec: (sql) => db.exec(sql),
        prepare: (sql) => db.prepare(sql),
        transaction: (fn) => db.transaction(fn),
        close: () => db.close(),
      };
    };
  }),
  tryLoad("node:sqlite", () => {
    const { DatabaseSync } = require("node:sqlite");
    return (file) => {
      const db = new DatabaseSync(file);
      return {
        exec: (sql) => db.exec(sql),
        prepare: (sql) => db.prepare(sql),
        transaction: (fn) => (...args) => {
          db.exec("BEGIN");
          try {
            const result = fn(...args);
            db.exec("COMMIT");
            return result;
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
        },
        close: () => db.close(),
      };
    };
  }),
].filter(Boolean);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(fn) {
  const times = [];
  for (let i = 0; i < ROUNDS; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return median(times);
}

const scenarios = {
  "insert en transaccion": (adapter) => {
    const db = adapter.create(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL)");
    const insert = db.prepare("INSERT INTO t (name, score) VALUES (?, ?)");
    const run = db.transaction(() => {
      for (let i = 0; i < ROWS; i++) insert.run("user" + i, i * 0.5);
    });
    const ms = measure(() => {
      db.exec("DELETE FROM t");
      run();
    });
    db.close();
    return ms;
  },
  "select get por id": (adapter) => {
    const db = adapter.create(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL)");
    const insert = db.prepare("INSERT INTO t (name, score) VALUES (?, ?)");
    db.transaction(() => {
      for (let i = 0; i < ROWS; i++) insert.run("user" + i, i * 0.5);
    })();
    const get = db.prepare("SELECT * FROM t WHERE id = ?");
    const ms = measure(() => {
      for (let i = 1; i <= ROWS; i++) get.get(i);
    });
    db.close();
    return ms;
  },
  "select all (tabla completa)": (adapter) => {
    const db = adapter.create(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL)");
    const insert = db.prepare("INSERT INTO t (name, score) VALUES (?, ?)");
    db.transaction(() => {
      for (let i = 0; i < ROWS; i++) insert.run("user" + i, i * 0.5);
    })();
    const all = db.prepare("SELECT * FROM t");
    const ms = measure(() => {
      all.all();
    });
    db.close();
    return ms;
  },
  "update por id": (adapter) => {
    const db = adapter.create(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL)");
    const insert = db.prepare("INSERT INTO t (name, score) VALUES (?, ?)");
    db.transaction(() => {
      for (let i = 0; i < ROWS; i++) insert.run("user" + i, i * 0.5);
    })();
    const update = db.prepare("UPDATE t SET score = score + 1 WHERE id = ?");
    const run = db.transaction(() => {
      for (let i = 1; i <= ROWS; i++) update.run(i);
    });
    const ms = measure(run);
    db.close();
    return ms;
  },
};

console.log(`Filas: ${ROWS} | Rondas: ${ROUNDS} | Node ${process.version} | ${process.platform}-${process.arch}`);
console.log("Mediana en ms (menos es mejor)\n");

const header = ["escenario", ...adapters.map((a) => a.name)];
const rows = [];
for (const [scenario, fn] of Object.entries(scenarios)) {
  rows.push([scenario, ...adapters.map((adapter) => fn(adapter).toFixed(1))]);
}

const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
console.log(line(header));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const row of rows) console.log(line(row));

if (adapters.length < 2) {
  console.log("\nInstala better-sqlite3 (npm i -D better-sqlite3) para compararlo tambien.");
}
