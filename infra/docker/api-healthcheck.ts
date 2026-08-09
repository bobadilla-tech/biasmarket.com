// Used as the compose healthcheck CMD for the api and workers services — no
// curl/wget baked into the image just for this, node is already there for
// free. Usage: node api-healthcheck.ts [port] [path]
// Defaults match apps/api's own port/route; apps/workers passes its own
// (3002, /health) explicitly — see docker-compose.dev.yml/docker-compose.yml.
import { get } from "node:http";

const port = process.argv[2] ?? "3000";
const path = process.argv[3] ?? "/api/health";

const req = get(`http://127.0.0.1:${port}${path}`, (res) => {
  res.resume();
  const processExitCode = (res.statusCode ?? 500) < 500 ? 0 : 1;

  res.on("end", () => process.exit(processExitCode));
});

req.on("error", () => process.exit(1));
