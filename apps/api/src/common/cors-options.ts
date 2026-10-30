// Request headers the browser may send cross-origin. `Idempotency-Key` is sent
// by the dashboard when creating an assisted order; a missing entry here makes
// the preflight reject the request.
export const CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "Idempotency-Key",
];

export function buildCorsOptions() {
  return {
    origin: process.env.WEB_URL ?? "http://localhost:3001",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
    allowedHeaders: CORS_ALLOWED_HEADERS,
  };
}
