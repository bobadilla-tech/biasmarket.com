import type { ProductDetailResponseDto } from "@biasmarket/types";

// Response shape comes from the generated OpenAPI client now (see
// lib/api-client.ts) — a plain type alias, not a zod schema. `findAll`/
// `findOne` both return `ProductDetailResponseDto` (product + variants +
// category join + soldUnits/availableStock), the shape every component in
// this feature consumes. apps/api's response DTO classes are the runtime
// guarantee for pass-through reads. See "OpenAPI note" in apps/web/AGENTS.md.
export type Product = ProductDetailResponseDto;
