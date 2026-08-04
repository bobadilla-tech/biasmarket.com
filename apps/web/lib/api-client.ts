import { createApiClient } from "@biasmarket/types";

// Same base-URL resolution as apiFetch (lib/api.ts): INTERNAL_API_URL for
// server-side (SSR/Server Component) fetches, which run inside the "web"
// container where "localhost" would resolve to that container rather than
// "api" — see infra/docker/.env.example. NEXT_PUBLIC_API_URL is the
// browser-reachable fallback.
const API_URL = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;

export const apiClient = createApiClient(`${API_URL}/api`);
