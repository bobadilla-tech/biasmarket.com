import {
  categories,
  collections,
  configureApiClient,
  contact,
  deliveryConfig,
  myStores,
  notifications,
  paymentConfig,
  pickupPoints,
  products,
  publicDeliveryConfig,
  publicPaymentConfig,
  publicPickupPoints,
  stores,
  storeSections,
  suggestions,
} from "@biasmarket/types";

// Same base-URL resolution as apiFetch (lib/api.ts): INTERNAL_API_URL for
// server-side (SSR/Server Component) fetches, which run inside the "web"
// container where "localhost" would resolve to that container rather than
// "api" — see infra/docker/.env.example. NEXT_PUBLIC_API_URL is the
// browser-reachable fallback. This must run before any generated method is
// called — every consumer imports `apiClient` from here rather than the
// generated modules directly, so module evaluation order guarantees it.
const API_URL = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error(
    "Missing INTERNAL_API_URL/NEXT_PUBLIC_API_URL — set one in the environment before the app starts",
  );
}
configureApiClient({ baseUrl: `${API_URL}/api` });

// One key per migrated feature/tag. Add a key here as each further feature
// migrates (see apps/web/AGENTS.md's OpenAPI note).
export const apiClient = {
  collections,
  products,
  categories,
  notifications,
  contact,
  suggestions,
  storeSections,
  deliveryConfig,
  publicDeliveryConfig,
  paymentConfig,
  publicPaymentConfig,
  pickupPoints,
  publicPickupPoints,
  stores,
  myStores,
};
