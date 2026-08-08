import fs from "fs";
import path from "path";
import type { NativeModule } from "./native";

let cachedAddon: NativeModule | null = null;

function detectMusl(): boolean {
  return fs.existsSync("/lib/ld-musl-x86_64.so.1") || fs.existsSync("/lib/ld-musl-aarch64.so.1");
}

function candidatePaths(): string[] {
  const root = path.join(__dirname, "..");
  const arch = process.arch;
  const platform = process.platform;
  const candidates: string[] = [];

  if (platform === "linux" && detectMusl()) {
    candidates.push(path.join(root, "prebuilds", `linuxmusl-${arch}`, "node.napi.node"));
  }
  candidates.push(path.join(root, "prebuilds", `${platform}-${arch}`, "node.napi.node"));
  candidates.push(path.join(root, "build", "Release", "infinitysqlite.node"));
  candidates.push(path.join(root, "build", "Debug", "infinitysqlite.node"));

  return candidates;
}

export function getPrebuildPath(): string | null {
  const found = candidatePaths().find((candidate) => candidate.includes("prebuilds") && fs.existsSync(candidate));
  return found ?? null;
}

export function getBinding(): NativeModule {
  if (cachedAddon) return cachedAddon;

  for (const candidate of candidatePaths()) {
    if (fs.existsSync(candidate)) {
      cachedAddon = require(candidate) as NativeModule;
      return cachedAddon;
    }
  }

  throw new Error("InfinitySQLite: no se encontro ningun binario nativo compatible con esta plataforma");
}
