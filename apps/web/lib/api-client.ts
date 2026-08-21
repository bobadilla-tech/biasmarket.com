import {
  addresses,
  categories,
  checkout,
  collections,
  configureApiClient,
  contact,
  coupons,
  couriers,
  customerAccount,
  customerAuth,
  customers,
  deliveryConfig,
  myStores,
  notifications,
  orders,
  paymentConfig,
  pickupPoints,
  products,
  productSearch,
  publicCouriers,
  publicDeliveryConfig,
  publicPaymentConfig,
  publicPickupPoints,
  restock,
  stats,
  stores,
  storeSections,
  suggestions,
  users,
  whatsappTemplates,
} from "@biasmarket/types";

// INTERNAL_API_URL for server-side fetches and NEXT_PUBLIC_API_URL for the
// browser-reachable fallback. During local development we default to
// http://localhost:3000 so the `api` app can be run separately without
// setting env vars.
const API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : undefined);
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
  orders,
  checkout,
  customerAuth,
  customerAccount,
  customers,
  productSearch,
  stats,
  users,
  restock,
  whatsappTemplates,
  addresses,
  coupons,
  couriers,
  publicCouriers,
};
