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

test("a test script that CI never runs is reported", () => {
  assert.deepEqual(checkWorkspaces(path.join(fixtures, "uncalled-test")), [
    'packages/lonely (@fixture/lonely): "test" script is never run in .github/workflows/ci.yml',
  ]);
});

test("--passWithNoTests is reported", () => {
  assert.deepEqual(checkWorkspaces(path.join(fixtures, "pass-with-no-tests")), [
    'packages/lax (@fixture/lax): "test" uses --passWithNoTests',
    'packages/lax (@fixture/lax): "test:cov" uses --passWithNoTests',
  ]);
});

test("the real repo is healthy", () => {
  assert.deepEqual(checkWorkspaces(path.join(fixtures, "../../../..")), []);
});
