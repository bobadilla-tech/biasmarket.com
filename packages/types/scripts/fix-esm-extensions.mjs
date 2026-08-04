// Orval emits relative import/export specifiers with no file extension
// (`from '../api.schemas'`), which `tsc` rejects under this package's
// NodeNext module resolution (see root CLAUDE.md: relative imports need
// explicit `.js` extensions even though the source is `.ts`). Orval has no
// config option for this (checked its `@orval/core` type defs), so this is a
// small postprocess pass over its output, run right after `orval` in the
// `generate` script — same "wrap the tool with a script" shape as
// apps/api's swagger-metadata/openapi-spec generators.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const generatedDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "generated",
);

const specifierPattern = /((?:from|import)\s+["'])(\.\.?\/[^"']+)(["'])/g;

async function fixFile(filePath) {
  const original = await readFile(filePath, "utf8");
  const fixed = original.replace(specifierPattern, (match, prefix, specifier, suffix) => {
    if (/\.[a-zA-Z0-9]+$/.test(specifier)) return match;
    return `${prefix}${specifier}.js${suffix}`;
  });
  if (fixed !== original) await writeFile(filePath, fixed, "utf8");
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath);
    } else if (entry.name.endsWith(".ts")) {
      await fixFile(entryPath);
    }
  }
}

await walk(generatedDir);
