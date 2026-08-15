#!/usr/bin/env node
// Checks (or formats with --write) files changed in this branch/worktree with Prettier.
// The repo predates any formatter, so a whole-package `prettier --check` fails
// on hundreds of untouched files; this gates only the diff (against BASE_REF,
// or origin/main locally) so new work can't ship unformatted while existing
// files stay untouched. Package linting can still scope files to one directory;
// the root `pnpm fix` command formats all changed files.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import prettier from "prettier";

const args = process.argv.slice(2);
const write = args.includes("--write");
const pkgDir =
  args.find((arg) => arg !== "--write") ?? (write ? undefined : "apps/api");
const baseRef = process.env.BASE_REF || "origin/main";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
process.chdir(repoRoot);

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function changedFiles() {
  // NUL-delimited name-only lists: `git diff --name-only` already resolves
  // renames/copies to their new path (no `old -> new` parsing), avoids
  // quoting issues on paths with special characters, and `-z` keeps paths
  // containing newlines intact.
  const committed = git(["diff", "--name-only", "-z", `${baseRef}...HEAD`]);
  const unstaged = git(["diff", "--name-only", "-z"]);
  const staged = git(["diff", "--cached", "--name-only", "-z"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]);

  return [...new Set([...committed, ...unstaged, ...staged, ...untracked])];
}

let files;
try {
  files = changedFiles().filter(
    (file) => !pkgDir || file.startsWith(`${pkgDir}/`),
  );
} catch (error) {
  console.error(
    `[lint] cannot determine changed files: no valid comparison base ` +
      `('${baseRef}'). Fetch it (e.g. git fetch origin main) or set BASE_REF.`,
  );
  console.error(`[lint] ${error.stderr || error.message}`);
  process.exit(1);
}

const failing = [];
let formattedCount = 0;
for (const file of files) {
  const absolute = path.resolve(repoRoot, file);
  if (!existsSync(absolute)) continue;

  const info = await prettier.getFileInfo(absolute);
  if (info.ignored || !info.inferredParser) continue;

  const config = await prettier.resolveConfig(absolute);
  const options = { ...config, filepath: absolute };
  const text = await readFile(absolute, "utf8");

  if (write) {
    const formatted = await prettier.format(text, options);
    if (formatted !== text) {
      await writeFile(absolute, formatted);
      formattedCount += 1;
    }
  } else if (!(await prettier.check(text, options))) {
    failing.push(file);
  }
}

if (write) {
  console.log(
    `Prettier: formatted ${formattedCount} of ${files.length} changed file(s)${
      pkgDir ? ` in ${pkgDir}` : ""
    }.`,
  );
} else if (failing.length > 0) {
  console.error(
    `\nPrettier: ${failing.length} changed file(s) in ${pkgDir} not formatted:`,
  );
  for (const file of failing) console.error(`  ${file}`);
  console.error(
    "Run `pnpm --filter <pkg> format` or `pnpm exec prettier --write <file>`.",
  );
  process.exit(1);
}

console.log(
  `Prettier: ${files.length} changed file(s) in ${pkgDir} formatted.`,
);
