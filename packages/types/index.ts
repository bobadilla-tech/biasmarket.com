import createClient from "openapi-fetch";
import type { paths } from "./generated/schema.js";

export type { components, paths } from "./generated/schema.js";

// Preconfigured `openapi-fetch` client factory — every consumer gets the
// same cookie-session behavior `apps/web/lib/api.ts` had (credentials:
// "include"), instead of reimplementing it. `baseUrl` is passed in rather
// than read from `process.env` here on purpose: the correct API origin
// differs between server-side (INTERNAL_API_URL, container-to-container) and
// client-side (NEXT_PUBLIC_API_URL, browser-reachable) contexts in Next.js,
// and only the caller (apps/web) knows which one applies — see
// apps/web/lib/api-client.ts.
export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl, credentials: "include" });
}
