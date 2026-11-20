import { fileURLToPath } from "node:url";

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateStagingApiUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("EXPO_PUBLIC_API_URL is required in the EAS preview environment");
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL must be an absolute HTTPS URL ending in /api");
  }

  const apiPath = url.pathname.replace(/\/+$/, "");
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    apiPath !== "/api"
  ) {
    throw new Error("EXPO_PUBLIC_API_URL must be an absolute HTTPS URL ending in /api without credentials, query, or fragment");
  }

  return url;
}

function runCli() {
  const [command, value] = process.argv.slice(2);
  if (command === "escape" && value !== undefined) {
    process.stdout.write(escapeRegex(value));
    return;
  }

  if (command === "validate-api-url") {
    validateStagingApiUrl(process.env.EXPO_PUBLIC_API_URL);
    process.stdout.write("Validated EAS preview EXPO_PUBLIC_API_URL\n");
    return;
  }

  process.stderr.write("Usage: mobile-maestro-config.mjs escape <value> | validate-api-url\n");
  process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
