import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { VOSEO_PATTERN } from "./voseo-patterns.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const secondPersonPattern =
  /(?<!\p{L})(?:inicia|crea|elige|ingresa|selecciona|escribe|usa|dime|tú|tu|tus|te|puedes|tienes|quieres|eres)(?!\p{L})/iu;
const leftoverTuteoPattern =
  /(?<!\p{L})(?:puedes|tienes|quieres|eres)(?!\p{L})/iu;

function get(value: unknown, keyPath: string): unknown {
  const tokens = [...keyPath.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map(
    (match) => match[1] ?? Number(match[2]),
  );
  return tokens.reduce<unknown>((current, key) => {
    if (current === null || typeof current !== "object") return undefined;
    return (current as Record<string | number, unknown>)[key];
  }, value);
}

function leafEntries(value: unknown, prefix = ""): [string, unknown][] {
  if (!value || typeof value !== "object") return [[prefix, value]];
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      leafEntries(child, `${prefix}[${index}]`),
    );
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafEntries(child, prefix ? `${prefix}.${key}` : key),
  );
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

function argumentNames(message: string): string[] {
  return [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)(?=\s*[,}])/g)]
    .map((match) => match[1]!)
    .sort();
}

test("voseo overlay keys exist in Spanish and keep ICU arguments", () => {
  const namespaces = [
    "common",
    "dashboard",
    "mobile",
    "onboarding",
    "storefront",
  ];

  for (const namespace of namespaces) {
    const base = JSON.parse(
      readFileSync(path.join(packageRoot, "es", `${namespace}.json`), "utf8"),
    );
    const overlay = JSON.parse(
      readFileSync(
        path.join(packageRoot, "es-voseo", `${namespace}.json`),
        "utf8",
      ),
    );

    for (const [keyPath, value] of leafEntries(overlay)) {
      const baseValue = get(base, keyPath);
      expect(baseValue, `${namespace}.${keyPath}`).not.toBeUndefined();
      if (typeof value === "string" && typeof baseValue === "string") {
        expect(argumentNames(value), `${namespace}.${keyPath}`).toEqual(
          argumentNames(baseValue),
        );
      }
    }
  }
});

test("the overlay covers every marked string on the specified screens", () => {
  const required = [
    ["onboarding", null],
    ["storefront", null],
    ["common", null],
    ["mobile", null],
    [
      "dashboard",
      new Set(["settings", "form", "shell", "actions", "notifications"]),
    ],
  ] as const;

  for (const [namespace, dashboardGroups] of required) {
    const suffix = namespace === "mobile" ? "mobile" : namespace;
    const base = JSON.parse(
      readFileSync(path.join(packageRoot, "es", `${suffix}.json`), "utf8"),
    );
    const overlay = JSON.parse(
      readFileSync(
        path.join(packageRoot, "es-voseo", `${suffix}.json`),
        "utf8",
      ),
    );

    for (const [keyPath, value] of leafEntries(base)) {
      if (typeof value !== "string" || !secondPersonPattern.test(value)) {
        continue;
      }
      if (
        dashboardGroups &&
        !dashboardGroups.has(keyPath.split(".")[0] as never)
      ) {
        continue;
      }
      expect(
        get(overlay, keyPath),
        `${namespace}.${keyPath}`,
      ).not.toBeUndefined();
    }

    for (const value of strings(overlay)) {
      expect(value).not.toMatch(leftoverTuteoPattern);
    }
  }
});

test("the shared pattern stays Unicode-aware in both cases", () => {
  for (const form of ["podés", "PODÉS", "tenés", "TENÉS"]) {
    assert.equal(VOSEO_PATTERN.test(form), true);
  }
});
