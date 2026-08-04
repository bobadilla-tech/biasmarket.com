#!/usr/bin/env node

// Standalone equivalent of the @nestjs/swagger CLI plugin for apps/api's SWC
// build (nest-cli.json: builder "swc", typeCheck false — SWC never runs the
// tsc/webpack transformer the CLI plugin hooks into). Runs PluginMetadataGenerator
// against apps/api's own typescript@5.9.3 (a real devDependency, independent of
// the root/web TS7 pin) to statically infer @ApiProperty-equivalent metadata
// from class-validator decorators and TS types, writing it to src/metadata.ts.
// PluginMetadataGenerator lives in @nestjs/cli, not @nestjs/swagger — only
// ReadonlyVisitor (the swagger-specific AST visitor) comes from
// "@nestjs/swagger/plugin". Verified against installed node_modules; Nest's own
// docs example imports both from these exact paths.
import { PluginMetadataGenerator } from "@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator.js";
import { ReadonlyVisitor } from "@nestjs/swagger/plugin";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, "..");
const srcDir = join(apiRoot, "src");
const outputPath = join(srcDir, "metadata.ts");

// PluginMetadataGenerator's non-watch path type-checks the *whole* program,
// including this script's own previous output, before writing a new
// metadata.ts — if that check fails for any reason it exits without ever
// regenerating (see PluginMetadataGenerator.runOnce in
// node_modules/@nestjs/cli/lib/compiler/swc/type-checker-host.js: on
// diagnostics it calls process.exit(1) before the onTypeCheck callback that
// does the write). Two consequences worth knowing before touching this file:
// 1) `main.ts` imports "./metadata.js" — on a first-ever run (fresh clone,
//    metadata.ts gitignored) that import doesn't resolve yet, which fails
//    the whole-program check before generation ever gets a chance to create
//    the file it's trying to create. The stub below breaks that bootstrap
//    cycle by making sure *some* valid metadata.ts always exists first.
// 2) A metadata.ts written while some other file had a type error (e.g. a
//    response DTO field typed as something that doesn't resolve, like
//    `Prisma.Decimal` — see the money-convention comment in
//    dto/collection-response.dto.ts) can itself become invalid TypeScript
//    (a broken dynamic-import specifier), which then poisons every future
//    run's whole-program check the same way. If regeneration silently stops
//    updating, delete src/metadata.ts and rerun this script to recover.
if (!existsSync(outputPath)) {
  writeFileSync(outputPath, "export default async () => ({});\n");
}

const generator = new PluginMetadataGenerator();
generator.generate({
  visitors: [
    new ReadonlyVisitor({
      introspectComments: true,
      pathToSource: srcDir,
      // apps/api is ESM (NodeNext, explicit .js import extensions) — without
      // this, the generated metadata.ts emits extensionless dynamic imports
      // that fail to resolve under NodeNext.
      esmCompatible: true,
    }),
  ],
  outputDir: srcDir,
  filename: "metadata.ts",
  tsconfigPath: "tsconfig.json",
  printDiagnostics: true,
});
