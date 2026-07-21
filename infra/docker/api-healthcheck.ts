// Used as the compose healthcheck CMD for the api service — no curl/wget
// baked into the image just for this, node is already there for free.
import { get } from "node:http";

const req = get("http://127.0.0.1:3000/api/health", (res) => {
  res.resume();
  const processExitCode = (res.statusCode ?? 500) < 500 ? 0 : 1;
  
  res.on("end", () => process.exit(processExitCode));
});

req.on("error", () => process.exit(1));
