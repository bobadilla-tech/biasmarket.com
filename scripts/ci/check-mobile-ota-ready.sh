#!/usr/bin/env bash
set -euo pipefail

node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync("apps/mobile/package.json", "utf8"),
);
const installed =
  packageJson.dependencies?.["expo-updates"] ||
  packageJson.devDependencies?.["expo-updates"];

if (!installed) {
  console.error(
    "Production OTA is disabled: apps/mobile must install expo-updates and complete a native build before publishing updates.",
  );
  process.exit(1);
}
NODE
