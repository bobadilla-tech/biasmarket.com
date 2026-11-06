#!/usr/bin/env node
// Cross-platform wrapper for `turbo run <task>` that supplies a dummy
// DATABASE_URL when none is set. `prisma generate` (via @biasmarket/db) only
// validates that the schema's env() reference resolves, it never connects, so
// any syntactically valid URL works; a real DATABASE_URL is left untouched.
//
// This replaces the POSIX-only `DATABASE_URL="${DATABASE_URL:-...}" turbo ...`
// prefix the root scripts used, which cmd.exe / PowerShell cannot parse
// (cross-env does not expand `${VAR:-default}` either).
//
// Usage: node scripts/with-turbo-env.mjs <task> [turbo args...]
import { spawn } from "node:child_process";

const DUMMY_DATABASE_URL =
  "postgresql://build:build@localhost:5432/build?schema=public";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "usage: node scripts/with-turbo-env.mjs <task> [turbo args...]",
  );
  process.exit(2);
}

const env = { ...process.env };
env.DATABASE_URL ||= DUMMY_DATABASE_URL;

// pnpm puts node_modules/.bin on PATH for package scripts, so `turbo` resolves.
// On Windows it is a .cmd shim, which only spawns through a shell.
const child = spawn("turbo", ["run", ...args], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("error", (err) => {
  console.error(`failed to start turbo: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
