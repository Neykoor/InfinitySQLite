import fs from "fs";
import path from "path";
import type { NativeModule } from "./native";

const PREBUILD_PLATFORMS = ["linux", "darwin", "win32"];
const PREBUILD_ARCHS = ["x64", "arm64"];

let DEFAULT_ADDON: NativeModule | null = null;

function isLinuxMusl(): boolean {
  if (process.platform !== "linux") return false;
  const report = process.report?.getReport();
  const header = report && typeof report === "object" ? (report as { header?: { glibcVersionRuntime?: string } }).header : undefined;
  return !header?.glibcVersionRuntime;
}

export function getPrebuildPath(): string | null {
  if (!PREBUILD_PLATFORMS.includes(process.platform) || !PREBUILD_ARCHS.includes(process.arch)) {
    return null;
  }
  const target = `${isLinuxMusl() ? "linuxmusl" : process.platform}-${process.arch}`;
  const filename = path.join(__dirname, "..", "prebuilds", `${target}.node`);
  return fs.existsSync(filename) ? filename : null;
}

export function getBinding(): NativeModule {
  if (DEFAULT_ADDON) return DEFAULT_ADDON;

  const prebuildPath = getPrebuildPath();
  if (prebuildPath) {
    DEFAULT_ADDON = require(prebuildPath) as NativeModule;
    return DEFAULT_ADDON;
  }

  let buildPath = path.join(__dirname, "..", "build", "Release", "infinitysqlite.node");
  if (!fs.existsSync(buildPath)) {
    buildPath = path.join(__dirname, "..", "build", "Debug", "infinitysqlite.node");
  }
  DEFAULT_ADDON = require(buildPath) as NativeModule;
  return DEFAULT_ADDON;
}
