import { execFileSync } from "child_process";
import { getPrebuildPath } from "./binding";

function main(): void {
  if (getPrebuildPath()) {
    process.exit(0);
  }

  let nodeGypCli: string;
  try {
    nodeGypCli = require.resolve("node-gyp/bin/node-gyp.js");
  } catch {
    console.error("infinitysqlite: no se encontro node-gyp en node_modules.");
    console.error("infinitysqlite: instala node-gyp o genera un prebuild para esta plataforma antes de instalar.");
    process.exit(1);
    return;
  }

  try {
    execFileSync(process.execPath, [nodeGypCli, "rebuild"], { stdio: "inherit" });
  } catch (error) {
    console.error("infinitysqlite: fallo la compilacion nativa con node-gyp.");
    throw error;
  }
}

main();
