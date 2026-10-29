#!/usr/bin/env node
// Guard: every workspace (apps/*, packages/*) must define `lint` and
// `typecheck`, so `turbo run lint` can never silently skip one. Without a
// `lint` script turbo reports "No tasks were executed" for that package and
// CI stays green while checking nothing.
//
// Usage: node scripts/ci/check-workspace-scripts.mjs [rootDir]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_SCRIPTS = ["lint", "typecheck"];
const WORKSPACE_PARENTS = ["apps", "packages"];

export function checkWorkspaces(rootDir) {
  const problems = [];
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
