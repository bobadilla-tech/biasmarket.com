import type { CategoryResponseDto } from "@biasmarket/types";

// Response shape comes from the generated OpenAPI client now (see
// lib/api-client.ts) — a plain type alias, not a zod schema. apps/api's
// CategoriesController + response DTO are the runtime guarantee for this
// pass-through read. See "OpenAPI note" in apps/web/AGENTS.md.
export type Category = CategoryResponseDto;
