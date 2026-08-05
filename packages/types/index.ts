export { configureApiClient } from "./http.js";
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
