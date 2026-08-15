export { ApiError, configureApiClient } from "./http.js";
export type { RequestOptions } from "./http.js";

// Response/request DTO types, generated from apps/api's committed
// openapi.json (see orval.config.ts). Feature schema files alias onto these
// instead of hand-writing zod schemas for pass-through reads — see the
// OpenAPI note in apps/web/AGENTS.md.
export * from "./generated/api.schemas.js";

// One namespace export per migrated tag/controller (see
// docs/plans/2026-08-04-typed-sdk-client-followups.md). Add a line here as
// each further module migrates; apps/web/lib/api-client.ts assembles these
// into a single `apiClient` object.
export * as collections from "./generated/collections/collections.js";
export * as products from "./generated/products/products.js";
export * as categories from "./generated/categories/categories.js";
export * as notifications from "./generated/notifications/notifications.js";
export * as contact from "./generated/contact/contact.js";
export * as suggestions from "./generated/suggestions/suggestions.js";
export * as storeSections from "./generated/store-sections/store-sections.js";
export * as deliveryConfig from "./generated/delivery-config/delivery-config.js";
export * as publicDeliveryConfig from "./generated/public-delivery-config/public-delivery-config.js";
export * as paymentConfig from "./generated/payment-config/payment-config.js";
export * as publicPaymentConfig from "./generated/public-payment-config/public-payment-config.js";
export * as pickupPoints from "./generated/pickup-points/pickup-points.js";
export * as publicPickupPoints from "./generated/public-pickup-points/public-pickup-points.js";
export * as stores from "./generated/stores/stores.js";
export * as myStores from "./generated/my-stores/my-stores.js";
export * as orders from "./generated/order/order.js";
export * as checkout from "./generated/checkout/checkout.js";
export * as customerAuth from "./generated/customer-auth/customer-auth.js";
export * as customerAccount from "./generated/customer-account/customer-account.js";
export * as customers from "./generated/customers/customers.js";
export * as productSearch from "./generated/product-search/product-search.js";
export * as stats from "./generated/stats/stats.js";
export * as users from "./generated/users/users.js";
export * as restock from "./generated/restock/restock.js";
export * as whatsappTemplates from "./generated/whatsapp-templates/whatsapp-templates.js";
export * as addresses from "./generated/addresses/addresses.js";
export * as coupons from "./generated/coupons/coupons.js";
