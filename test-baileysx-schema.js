const fs = require("fs");
const os = require("os");
const path = require("path");

console.log("platform:", process.platform, "arch:", process.arch, "node:", process.version);

const distPath = path.join(__dirname, "dist");
if (!fs.existsSync(distPath)) {
  console.error("No existe dist/. Corre antes: npm install --ignore-scripts && npm run build");
  process.exit(1);
}

const InfinitySQLite = require(distPath);

let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log("OK   ", label);
  } else {
    console.error("FALLO", label);
    failed++;
  }
}

function openAuthDb(filePath) {
  const db = new InfinitySQLite(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS creds (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS signal_keys (
      type TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (type, id)
    );
    CREATE INDEX IF NOT EXISTS signal_keys_type_idx ON signal_keys(type);
  `);
  return db;
}

function openStoreDb(filePath) {
  const db = new InfinitySQLite(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_metadata (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      jid TEXT NOT NULL,
      msg_id TEXT NOT NULL,
      ts INTEGER,
      value TEXT NOT NULL,
      PRIMARY KEY (jid, msg_id)
    );
    CREATE INDEX IF NOT EXISTS messages_jid_ts_idx ON messages(jid, ts);
  `);
  return db;
}

function runAuthFlow(db, tag) {
  const stmts = {
    credsSelect: db.prepare("SELECT value FROM creds WHERE key = ?"),
    credsUpsert: db.prepare(
      "INSERT INTO creds (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ),
    keyUpsert: db.prepare(
      "INSERT INTO signal_keys (type, id, value) VALUES (?, ?, ?) ON CONFLICT(type, id) DO UPDATE SET value = excluded.value"
    ),
    keyDelete: db.prepare("DELETE FROM signal_keys WHERE type = ? AND id = ?"),
    keyList: db.prepare("SELECT id, value FROM signal_keys WHERE type = ?"),
    clearKeys: db.prepare("DELETE FROM signal_keys")
  };

  stmts.credsUpsert.run("__creds__", JSON.stringify({ noiseKey: tag, registered: true }));
  const credsRow = stmts.credsSelect.get("__creds__");
  check(tag + ": creds guardadas y leidas", credsRow && JSON.parse(credsRow.value).noiseKey === tag);

  const writeKeys = db.transaction(entries => {
    for (const [type, id, value] of entries) {
      stmts.keyUpsert.run(type, id, value);
    }
  });
  writeKeys([
    ["pre-key", "1", "aaa"],
    ["pre-key", "2", "bbb"],
    ["app-state-sync-key", "x", "ccc"]
  ]);

  const preKeys = stmts.keyList.all("pre-key");
  check(tag + ": transaccion anidada inserto 2 pre-keys", preKeys.length === 2);

  stmts.keyDelete.run("pre-key", "1");
  const preKeysAfterDelete = stmts.keyList.all("pre-key");
  check(tag + ": delete de key individual", preKeysAfterDelete.length === 1);

  stmts.clearKeys.run();
  const afterClear = stmts.keyList.all("pre-key");
  check(tag + ": clearKeys vacio la tabla", afterClear.length === 0);
}

function runStoreFlow(db, tag) {
  const stmts = {
    chatUpsert: db.prepare(
      "INSERT INTO chats (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value"
    ),
    chatAll: db.prepare("SELECT value FROM chats"),
    msgUpsert: db.prepare(
      "INSERT INTO messages (jid, msg_id, ts, value) VALUES (?, ?, ?, ?) ON CONFLICT(jid, msg_id) DO UPDATE SET value = excluded.value, ts = excluded.ts"
    ),
    msgPage: db.prepare("SELECT value FROM messages WHERE jid = ? ORDER BY ts DESC LIMIT ?"),
    msgPageBefore: db.prepare(
      "SELECT value FROM messages WHERE jid = ? AND ts < ? ORDER BY ts DESC LIMIT ?"
    ),
    msgGetTs: db.prepare("SELECT ts FROM messages WHERE jid = ? AND msg_id = ?")
  };

  const upsertChats = chats => {
    const tx = db.transaction(items => {
      for (const chat of items) stmts.chatUpsert.run(chat.id, JSON.stringify(chat));
    });
    tx(chats);
  };
  upsertChats([
    { id: "5511999@s.whatsapp.net", name: tag + "-chat-1" },
    { id: "5511888@s.whatsapp.net", name: tag + "-chat-2" }
  ]);
  check(tag + ": upsert de chats en lote", stmts.chatAll.all().length === 2);

  const jid = "5511999@s.whatsapp.net";
  const upsertMessages = msgs => {
    const tx = db.transaction(items => {
      for (const m of items) stmts.msgUpsert.run(m.jid, m.id, m.ts, JSON.stringify(m));
    });
    tx(msgs);
  };
  upsertMessages([
    { jid, id: "m1", ts: 100 },
    { jid, id: "m2", ts: 200 },
    { jid, id: "m3", ts: 300 }
  ]);

  const page = stmts.msgPage.all(jid, 2);
  check(tag + ": paginacion ORDER BY ts DESC LIMIT", page.length === 2 && JSON.parse(page[0].value).id === "m3");

  const cursorTs = stmts.msgGetTs.get(jid, "m3").ts;
  const before = stmts.msgPageBefore.all(jid, cursorTs, 10);
  check(tag + ": paginacion con cursor 'before'", before.length === 2);

  db.pragma("wal_checkpoint(PASSIVE)");
  check(tag + ": wal_checkpoint(PASSIVE) no tiro error", true);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "infinitysqlite-test-"));
console.log("directorio temporal:", tmpDir);

const bot1Auth = openAuthDb(path.join(tmpDir, "bot1-auth.db"));
const bot2Auth = openAuthDb(path.join(tmpDir, "bot2-auth.db"));
const bot1Store = openStoreDb(path.join(tmpDir, "bot1-store.db"));
const bot2Store = openStoreDb(path.join(tmpDir, "bot2-store.db"));

runAuthFlow(bot1Auth, "bot1");
runAuthFlow(bot2Auth, "bot2");
runStoreFlow(bot1Store, "bot1");
runStoreFlow(bot2Store, "bot2");

check("bot1.open sigue en true antes de cerrar", bot1Auth.open === true);

for (const db of [bot1Auth, bot2Auth, bot1Store, bot2Store]) {
  db.close();
}

check("close() no tiro error en las 4 instancias", true);

if (failed > 0) {
  console.error("\n" + failed + " chequeo(s) fallaron");
  process.exit(1);
} else {
  console.log("\ntodo OK, " + tmpDir + " se puede borrar a mano");
}
