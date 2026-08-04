import { collections, configureApiClient } from "@biasmarket/types";

// Same base-URL resolution as apiFetch (lib/api.ts): INTERNAL_API_URL for
// server-side (SSR/Server Component) fetches, which run inside the "web"
// container where "localhost" would resolve to that container rather than
// "api" — see infra/docker/.env.example. NEXT_PUBLIC_API_URL is the
// browser-reachable fallback. This must run before any generated method is
// called — every consumer imports `apiClient` from here rather than the
// generated modules directly, so module evaluation order guarantees it.
const API_URL = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
configureApiClient({ baseUrl: `${API_URL}/api` });

// One key per migrated feature/tag — collections is the only one so far.
// Add a key here as each further feature migrates (see
// apps/web/AGENTS.md's OpenAPI note).
export const apiClient = { collections };
