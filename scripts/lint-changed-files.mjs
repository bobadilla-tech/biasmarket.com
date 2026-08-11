#!/usr/bin/env node
// Lints the files changed in this branch/worktree for one package with Prettier.
// The repo predates any formatter, so a whole-package `prettier --check` fails
// on hundreds of untouched files; this gates only the diff (against BASE_REF,
// or origin/main locally) so new work can't ship unformatted while existing
// files stay untouched. Files outside the given package dir are ignored.
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import prettier from "prettier";

const [pkgDir = "apps/api"] = process.argv.slice(2);
const baseRef = process.env.BASE_REF || "origin/main";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
process.chdir(repoRoot);

function changedFiles() {
  const worktree = execSync("git status --porcelain", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim());

  let committed = [];
  try {
    committed = execSync(`git diff --name-only ${baseRef}...HEAD`, {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    console.warn(
      `[lint] base '${baseRef}' unavailable; checking worktree changes only`,
    );
  }

  return [...new Set([...worktree, ...committed])].filter(Boolean);
}

const files = changedFiles().filter((file) => file.startsWith(`${pkgDir}/`));

const failing = [];
for (const file of files) {
  const absolute = path.resolve(repoRoot, file);
  if (!existsSync(absolute)) continue;

  const info = await prettier.getFileInfo(absolute);
  if (info.ignored || !info.inferredParser) continue;

  const text = await readFile(absolute, "utf8");
  const config = await prettier.resolveConfig(absolute);
  if (!(await prettier.check(text, { ...config, filepath: absolute }))) {
    failing.push(file);
  }
}

if (failing.length > 0) {
  console.error(
    `\nPrettier: ${failing.length} changed file(s) in ${pkgDir} not formatted:`,
  );
  for (const file of failing) console.error(`  ${file}`);
  console.error("Run `pnpm --filter <pkg> format` or `pnpm exec prettier --write <file>`.");
  process.exit(1);
}

console.log(`Prettier: ${files.length} changed file(s) in ${pkgDir} formatted.`);
