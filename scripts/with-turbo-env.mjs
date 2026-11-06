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
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

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

// Run turbo's JS entrypoint with the current Node binary instead of the
// `turbo` shim: no shell is involved (so Windows cmd.exe never re-parses
// arguments such as paths containing `&`), and it works the same everywhere.
const require = createRequire(import.meta.url);
const turboPkgPath = require.resolve("turbo/package.json");
const { bin } = require(turboPkgPath);
const turboBin = path.resolve(
  path.dirname(turboPkgPath),
  typeof bin === "string" ? bin : bin.turbo,
);

const child = spawn(process.execPath, [turboBin, "run", ...args], {
  env,
  stdio: "inherit",
});

// Forward termination signals so cancelling the wrapper (CI cancel, Ctrl+C
// sent to the wrapper only) also stops turbo, then wait for it to exit.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (err) => {
  console.error(`failed to start turbo: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(128 + (os.constants.signals[signal] ?? 0));
  process.exit(code ?? 1);
});
