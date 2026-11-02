import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function leafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [prefix];
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

test("English and Spanish dictionaries have matching key paths", () => {
  for (const fileName of readdirSync(path.join(packageRoot, "es"))) {
    const spanish = JSON.parse(
      readFileSync(path.join(packageRoot, "es", fileName), "utf8"),
    );
    const english = JSON.parse(
      readFileSync(path.join(packageRoot, "en", fileName), "utf8"),
    );

    expect(leafPaths(spanish).sort(), fileName).toEqual(
      leafPaths(english).sort(),
    );
  }
});
