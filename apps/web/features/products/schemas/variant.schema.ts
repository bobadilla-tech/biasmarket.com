import type { VariantResponseDto } from "@biasmarket/types";

// Response shape comes from the generated OpenAPI client now (see
// lib/api-client.ts) — a plain type alias, not a zod schema. apps/api's
// VariantResponseDto is the runtime guarantee for pass-through reads. See
// "OpenAPI note" in apps/web/AGENTS.md.
export type Variant = VariantResponseDto;

export type VariantDraft = {
  name: string;
  stock?: number;
  priceOverride?: number;
  attributes?: Record<string, string>;
};

export type OptionTypeDraft = {
  id: string;
  name: string;
  values: string[];
};
