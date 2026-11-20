import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = join(root, "infra/docker/docker-compose.dev.yml");
const exampleEnvFile = join(root, "infra/docker/.env.example");

const domain = process.env.INFISICAL_DOMAIN;
const projectId = process.env.INFISICAL_PROJECT_ID;

if (!domain || !projectId) {
  console.error(
    "Set INFISICAL_DOMAIN and INFISICAL_PROJECT_ID to the team's self-hosted development project.",
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const composeArgs = args.length === 0 ? ["up", "--build"] : args;
process.umask(0o077);
process.on("SIGINT", () => {
  process.exitCode = 130;
});
process.on("SIGTERM", () => {
  process.exitCode = 143;
});
const tempDir = mkdtempSync(join(tmpdir(), "biasmarket-infisical-dev-"));
const envFile = join(tempDir, "secrets.env");

try {
  const exportResult = spawnSync(
    "infisical",
    [
      "export",
      `--env=${process.env.INFISICAL_ENV ?? "dev"}`,
      `--projectId=${projectId}`,
      `--path=${process.env.INFISICAL_PATH ?? "/"}`,
      "--format=dotenv",
      `--output-file=${envFile}`,
    ],
    {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "ignore", "inherit"],
    },
  );

  if (exportResult.error) throw exportResult.error;
  if (exportResult.status !== 0) {
    console.error(
      "Infisical export failed. Check CLI login, domain, project, environment, and path.",
    );
    process.exitCode = exportResult.status ?? 1;
  } else {
    chmodSync(tempDir, 0o700);
    chmodSync(envFile, 0o600);

    const exported = new Set(
      readFileSync(envFile, "utf8")
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
        .filter(Boolean),
    );
    const expected = readFileSync(exampleEnvFile, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
      .filter((key) => key && key !== "COMPOSE_BAKE");
    const missing = expected.filter((key) => !exported.has(key));

    if (missing.length > 0) {
      console.error(
        `Infisical development environment is missing required keys: ${missing.join(", ")}`,
      );
      process.exitCode = 1;
    } else {
      const mode = statSync(envFile).mode & 0o777;
      if (mode !== 0o600) {
        console.error("Could not protect the temporary Infisical export file.");
        process.exitCode = 1;
      } else {
        const composeResult = spawnSync(
          "docker",
          ["compose", "--env-file", envFile, "-f", composeFile, ...composeArgs],
          {
            cwd: root,
            env: {
              ...process.env,
              BIASMARKET_INFISICAL_ENV_FILE: envFile,
            },
            stdio: "inherit",
          },
        );

        if (composeResult.error) throw composeResult.error;
        process.exitCode = composeResult.status ?? 1;
      }
    }
  }
} catch (error) {
  console.error(
    `Could not start the Infisical development workflow: ${error.message}`,
  );
  process.exitCode = 1;
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
