#!/usr/bin/env node

// Standalone OpenAPI spec emission: boots the real Nest app graph (needed so
// SwaggerModule.createDocument can introspect actual registered routes/DI)
// but never calls `.listen()`, since this process only needs to write a file
// and exit.
//
// Imports from `../dist`, not `../src`, and therefore requires `nest build`
// to have run first (the `generate:openapi` package.json script does this).
// Reason: AppModule and its whole module graph use `experimentalDecorators`/
// `emitDecoratorMetadata` (`@Module`, `@Injectable`, etc.) — Node's native
// TypeScript support (which is what lets this repo's other `scripts/*.ts`
// run via plain `node foo.ts`, see root CLAUDE.md) only strips types, it
// doesn't transform legacy decorators, so `node` can't load `../src/app.module.ts`
// directly. `../dist/app.module.js` is SWC-compiled output where decorators
// are already transformed to plain JS, so plain `node` runs it fine.
//
// Boots via `Test.createTestingModule` + `.overrideProvider(PrismaService)`,
// not `NestFactory.create` — spec generation only needs routes/DI wired up
// for reflection, it never actually runs a query, so a real Postgres
// connection is pure overhead. `PrismaService.onModuleInit` calls `$connect()`
// unconditionally; overriding the whole class with a stub means Nest never
// constructs the real one, so the `PrismaPg` adapter (which reads
// DATABASE_URL) never gets built and no connection is attempted. This also
// means `generate:openapi` needs no `pnpm docker:dev` / local Postgres at
// all — only env vars other providers read eagerly at construction (not
// connect to) still apply, e.g. `S3_*` (StorageService) and
// `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (MailerService) — see apps/api/.env.
//
// The `../dist/*` imports below are built via `join()` at runtime rather
// than written as static specifiers on purpose: this file is itself part of
// the tsconfig program that `generate-swagger-metadata.ts` whole-program
// type-checks before writing metadata.ts (see that script's comment on
// PluginMetadataGenerator.runOnce), and that check — plus plain `pnpm
// typecheck` — runs before `dist/` necessarily exists. A static
// `import ... from "../dist/app.module.js"` would fail tsc's module
// resolution in both cases. A computed specifier types as `any` and skips
// static resolution, so typecheck only ever validates this file's own code.
import "dotenv/config";

import { Test } from "@nestjs/testing";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const outputPath = join(__dirname, "..", "openapi.json");

async function main() {
  const { AppModule } = await import(join(distDir, "app.module.js"));
  const { PrismaService } = await import(
    join(distDir, "prisma", "prisma.service.js")
  );
  const { default: metadata } = await import(join(distDir, "metadata.js"));

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  // Must run before createDocument — see the sequencing note in src/main.ts.
  await SwaggerModule.loadPluginMetadata(metadata);
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Bias Market API")
      .setDescription("Bias Market — niche-first store builder API")
      .setVersion("1.0")
      .build(),
  );

  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`Wrote ${outputPath}`);
}

main();
