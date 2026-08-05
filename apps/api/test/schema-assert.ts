import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// MAIL_DRIVER=file (see apps/api/.env) writes outgoing emails here instead
// of sending them — used to pull the real email-verification link out of the
// signup email, the same way a person would click it, rather than
// hand-rolling a session/cookie shortcut.
export const mailerDevDir = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  ".mailer-dev",
);
mkdirSync(mailerDevDir, { recursive: true });

// `vitest.config.e2e.ts` sets `fileParallelism: false`, so specs run
// sequentially — but within a single spec's own concurrent operations (or a
// future change to that config) a new file could belong to a different
// signup. Filtering by recipient keeps this correct either way.
export async function waitForNewMailerFile(
  existingFiles: Set<string>,
  recipient: string,
  timeoutMs = 5000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = readdirSync(mailerDevDir).filter(
      (f) => !existingFiles.has(f),
    );
    // Filenames are `${Date.now()}-${randomUUID()}.html` — no recipient info
    // — so concurrent specs are disambiguated by the "To:" header written
    // inside each file instead.
    const added = current.find((f) =>
      readFileSync(join(mailerDevDir, f), "utf-8").includes(`To: ${recipient}`)
    );
    if (added) return join(mailerDevDir, added);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for verification email to be written");
}

// Minimal dependency-free schema check — good enough for these e2e tests'
// purpose (catch response/DTO drift) without adding a JSON Schema validator
// dependency.
export function assertMatchesSchema(
  value: unknown,
  schema: Record<string, unknown>,
  components: Record<string, unknown>,
  path = "$",
): void {
  const resolved = resolveSchema(schema, components);
  if (resolved.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${path}: expected object, got ${JSON.stringify(value)}`);
    }
    const properties = (resolved.properties ?? {}) as Record<string, unknown>;
    const required = (resolved.required ?? []) as string[];
    for (const key of required) {
      if (!(key in (value as Record<string, unknown>))) {
        throw new Error(`${path}: missing required property "${key}"`);
      }
    }
    for (
      const [key, propValue] of Object.entries(value as Record<string, unknown>)
    ) {
      const propSchema = properties[key];
      if (!propSchema) {
        if (resolved.additionalProperties) continue;
        throw new Error(`${path}.${key}: property not declared in schema`);
      }
      assertMatchesSchema(
        propValue,
        propSchema as Record<string, unknown>,
        components,
        `${path}.${key}`,
      );
    }
    return;
  }
  if (resolved.type === "array") {
    if (!Array.isArray(value)) {
      throw new Error(`${path}: expected array, got ${JSON.stringify(value)}`);
    }
    value.forEach((item, i) =>
      assertMatchesSchema(
        item,
        resolved.items as Record<string, unknown>,
        components,
        `${path}[${i}]`,
      )
    );
    return;
  }
  if (resolved.nullable && value === null) return;
  if (resolved.type === "string" && typeof value !== "string") {
    throw new Error(`${path}: expected string, got ${JSON.stringify(value)}`);
  }
  if (resolved.type === "number" && typeof value !== "number") {
    throw new Error(`${path}: expected number, got ${JSON.stringify(value)}`);
  }
  if (resolved.type === "boolean" && typeof value !== "boolean") {
    throw new Error(`${path}: expected boolean, got ${JSON.stringify(value)}`);
  }
}

export function resolveSchema(
  schema: Record<string, unknown>,
  components: Record<string, unknown>,
): Record<string, unknown> {
  const ref = schema["$ref"] as string | undefined;
  if (!ref) return schema;
  const name = ref.replace("#/components/schemas/", "");
  const schemas = (components as { schemas: Record<string, unknown> }).schemas;
  return schemas[name] as Record<string, unknown>;
}
