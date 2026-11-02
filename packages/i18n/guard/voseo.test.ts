import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { VOSEO_FORMS, VOSEO_PATTERN } from "./voseo-patterns.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(filePath);
    if (!/\.(json|ts)$/.test(entry.name)) return [];
    if (/\.(spec|test)\.ts$/.test(entry.name)) return [];
    return [filePath];
  });
}

describe("Spanish tuteo copy guard", () => {
  test("the Unicode-aware pattern catches every seeded form", () => {
    for (const form of VOSEO_FORMS) {
      expect(VOSEO_PATTERN.test(`Hola, ${form}.`), form).toBe(true);
    }
  });

  test("the pattern does not match a form inside a larger word", () => {
    for (const form of VOSEO_FORMS) {
      expect(VOSEO_PATTERN.test(`x${form}y`), form).toBe(false);
    }
  });

  test("Spanish dictionaries, WhatsApp defaults, and API source contain no voseo", () => {
    const paths = [
      path.join(repositoryRoot, "packages/i18n/es"),
      path.join(repositoryRoot, "packages/utils/src/whatsapp"),
      path.join(repositoryRoot, "apps/api/src"),
    ];
    const violations: string[] = [];

    for (const directory of paths) {
      for (const filePath of filesUnder(directory)) {
        const contents = readFileSync(filePath, "utf8");
        for (const [index, line] of contents.split("\n").entries()) {
          const match = line.match(VOSEO_PATTERN);
          if (match) {
            violations.push(
              `${path.relative(repositoryRoot, filePath)}:${index + 1}: ${match[0]}`,
            );
          }
        }
      }
    }

    assert.deepEqual(violations, []);
  });
});
