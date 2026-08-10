// Pure liveness ping — no call to `api`, no DB access. `web` is hard-ruled
// off talking to Postgres directly, and coupling this to `api`'s
// availability would make a failure here ambiguous (web down, or api down
// and web merely reporting that?).
export function GET() {
  return Response.json({ status: "ok" });
}
