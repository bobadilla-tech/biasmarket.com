#!/usr/bin/env node

// Generates infra/docker/.env (production) from .env.example with fresh secrets.
// Dev already runs off the committed .env.example defaults — this script is prod-only.
// Usage: pnpm env:init [--force]

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dockerDir = join(dirname(fileURLToPath(import.meta.url)), "..", "infra", "docker");
const examplePath = join(dockerDir, ".env.example");
const envPath = join(dockerDir, ".env");

const force = process.argv.slice(2).includes("--force");

if (existsSync(envPath) && !force) {
  console.error(`${envPath} already exists. Pass --force to overwrite.`);
  process.exit(1);
}

const genSecret = (bytes: number) => randomBytes(bytes).toString("hex");

// Alphanumeric only — safe to embed unescaped in a Postgres connection URL.
const genPassword = () => randomBytes(24).toString("base64url");

const postgresPassword = genPassword();
const betterAuthSecret = genSecret(32);
const s3AccessKey = genPassword();
const s3SecretKey = genPassword();

const replacements: Record<string, string> = {
  POSTGRES_PASSWORD: postgresPassword,
  DATABASE_URL: `postgresql://biasmarket:${postgresPassword}@db:5432/biasmarket`,
  BETTER_AUTH_SECRET: betterAuthSecret,
  BETTER_AUTH_URL: "https://api.biasmarket.com",
  WEB_URL: "https://biasmarket.com",
  NEXT_PUBLIC_API_URL: "https://api.biasmarket.com",
  // Also doubles as MINIO_ROOT_USER/MINIO_ROOT_PASSWORD (see docker-compose.yml).
  S3_ACCESS_KEY: s3AccessKey,
  S3_SECRET_KEY: s3SecretKey,
  S3_PUBLIC_URL: "https://cdn.biasmarket.com",
};

const lines = readFileSync(examplePath, "utf8").split("\n");

const out = lines.map((line) => {
  const match = /^([A-Z_][A-Z0-9_]*)=/.exec(line);
  
  if (match && match[1] in replacements) {
    return `${match[1]}=${replacements[match[1]]}`;
  }

  return line;
});

writeFileSync(envPath, out.join("\n"));

console.log(`Wrote ${envPath} (prod)`);
console.log(
  "Generated: POSTGRES_PASSWORD, DATABASE_URL, BETTER_AUTH_SECRET, S3_ACCESS_KEY, S3_SECRET_KEY",
);
