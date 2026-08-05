import { z } from "zod";
import type { StoreSectionResponseDto } from "@biasmarket/types";

// Response shape comes from the generated OpenAPI client now (see
// lib/api-client.ts) — a plain type alias, not a zod schema. apps/api's
// StoreSectionsController + response DTO are the runtime guarantee for this
// pass-through read. `content` is untyped JSON on the DTO (it varies per
// `type`) — narrow it at the read site if a specific shape is needed. See
// "OpenAPI note" in apps/web/AGENTS.md.
export type StoreSection = StoreSectionResponseDto;
export type SectionType = StoreSection["type"];

// Flat + refine (not a discriminated union) so the create form can hold all
// fields simultaneously while the UI switches which are shown/required —
// mirrors the old page's imperative disabled-button logic.
export const sectionFormSchema = z
  .object({
    type: z.enum(["COLLECTION", "BANNER", "TEXT_BLOCK"]),
    collectionId: z.string(),
    imageUrl: z.string(),
    linkUrl: z.string(),
    body: z.string(),
  })
  .refine(
    (data) => {
      if (data.type === "COLLECTION") return !!data.collectionId;
      if (data.type === "BANNER") return !!data.imageUrl;
      return !!data.body;
    },
    { message: "required field missing", path: ["type"] },
  );

export type SectionFormInput = z.infer<typeof sectionFormSchema>;
