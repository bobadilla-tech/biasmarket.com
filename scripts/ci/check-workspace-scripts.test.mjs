import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkWorkspaces } from "./check-workspace-scripts.mjs";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/workspace-scripts",
);

test("healthy tree has no problems", () => {
  assert.deepEqual(checkWorkspaces(path.join(fixtures, "healthy")), []);
});

test("missing lint script is reported", () => {
  assert.deepEqual(checkWorkspaces(path.join(fixtures, "missing-lint")), [
    'packages/broken (@fixture/broken): missing "lint" script',
  ]);
});

test("the real repo is healthy", () => {
  assert.deepEqual(checkWorkspaces(path.join(fixtures, "../../../..")), []);
});
