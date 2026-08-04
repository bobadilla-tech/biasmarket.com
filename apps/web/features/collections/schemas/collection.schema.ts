import { z } from "zod";
import type { components } from "@biasmarket/types";

// Response shapes come from the generated OpenAPI client now (see
// lib/api-client.ts) — these are plain type aliases, not zod schemas.
// apps/api's response DTOs (CollectionsController + response DTO classes)
// are the runtime guarantee for pass-through reads like this; zod stays only
// for real client-side logic, e.g. the form schema below. See "OpenAPI note"
// in apps/web/AGENTS.md.
export type Collection = components["schemas"]["CollectionWithProductsResponseDto"];
export type CollectionProduct =
  components["schemas"]["CollectionProductWithProductResponseDto"];

export const createCollectionSchema = z.object({
  name: z.string().min(1, "name required"),
  description: z.string(),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
