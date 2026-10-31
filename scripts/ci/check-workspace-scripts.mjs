#!/usr/bin/env node
// Guard: makes it hard to add a workspace or test suite that CI ignores.
//   1. every workspace (apps/*, packages/*) defines `lint` and `typecheck`;
//      without `lint` turbo reports "No tasks were executed" for it and CI
//      stays green while checking nothing;
//   2. every workspace with a `test` script is run by a `run:` line in
//      .github/workflows/ci.yml (`--filter <name>` plus `test` or `test:cov`,
//      no `exec`);
//   3. no `test`/`test:cov` script uses `--passWithNoTests`, which lets a
//      deleted or mis-globbed suite pass.
// Rule 2 proves the invocation text exists, not that its job can trigger, and
// it does not see multi-line `run: |` blocks: keep test invocations on one
// line. Workspaces without a `test` script (db, i18n, queue, query, sanity)
// are not required to have one.
//
// Usage: node scripts/ci/check-workspace-scripts.mjs [rootDir]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_SCRIPTS = ["lint", "typecheck"];
const WORKSPACE_PARENTS = ["apps", "packages"];
const WORKFLOW = ".github/workflows/ci.yml";

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Single-line `run:` commands of the workflow, `#` comments stripped.
function runLines(rootDir) {
  const file = path.join(rootDir, WORKFLOW);
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, ""))
    .map((line) => line.match(/^\s*(?:-\s+)?run:\s*(.+)$/)?.[1])
    .filter(Boolean);
}

function isTestRun(line, name) {
  return (
    new RegExp(`--filter[ =]${escapeRegExp(name)}(\\s|$)`).test(line) &&
    /\btest(:cov)?(\s|$)/.test(line) &&
    !/\bexec\b/.test(line) &&
    !/test:e2e/.test(line)
  );
}

export function checkWorkspaces(rootDir) {
  const problems = [];
  const runs = runLines(rootDir);
  for (const parent of WORKSPACE_PARENTS) {
    const parentDir = path.join(rootDir, parent);
    if (!existsSync(parentDir)) continue;
    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(parentDir, entry.name, "package.json");
      // Untracked local dirs without a package.json are not workspaces.
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      for (const script of REQUIRED_SCRIPTS) {
        if (!pkg.scripts?.[script]) {
          problems.push(
            `${parent}/${entry.name} (${pkg.name}): missing "${script}" script`,
          );
        }
      }
      if (!pkg.scripts?.test) continue;
      const where = `${parent}/${entry.name} (${pkg.name})`;
      if (runs === null) {
        problems.push(
          `${where}: has a "test" script but ${WORKFLOW} is missing`,
        );
      } else if (!runs.some((line) => isTestRun(line, pkg.name))) {
        problems.push(`${where}: "test" script is never run in ${WORKFLOW}`);
      }
      for (const script of ["test", "test:cov"]) {
        if (pkg.scripts[script]?.includes("--passWithNoTests")) {
          problems.push(`${where}: "${script}" uses --passWithNoTests`);
        }
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = path.resolve(
    process.argv[2] ?? path.join(path.dirname(process.argv[1]), "../.."),
  );
  const problems = checkWorkspaces(rootDir);
  if (problems.length > 0) {
    console.error("Workspace script check failed:");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log("Workspace script check passed.");
}
