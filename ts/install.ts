import { execFileSync } from "child_process";
import { getPrebuildPath } from "./binding";

function main(): void {
  if (getPrebuildPath()) {
    process.exit(0);
  }
  execFileSync("node-gyp", ["rebuild"], { stdio: "inherit" });
}

main();
