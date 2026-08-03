import { z } from "zod";

// The BANNER branch allows an optional `alt` — the live storefront renderer
// (store/[slug]/page.tsx) already reads `section.content.alt` even though the
// dashboard editor never sets it today. Included so this schema describes the
// real content shape even though nothing here writes it yet.
export const sectionCollectionContentSchema = z.object({});
export const sectionBannerContentSchema = z.object({
  imageUrl: z.string(),
  linkUrl: z.string().optional(),
  alt: z.string().optional(),
});
export const sectionTextBlockContentSchema = z.object({ body: z.string() });

export const storeSectionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("COLLECTION"),
    collectionId: z.string().nullable(),
    content: sectionCollectionContentSchema,
    position: z.number(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("BANNER"),
    collectionId: z.string().nullable(),
    content: sectionBannerContentSchema,
    position: z.number(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("TEXT_BLOCK"),
    collectionId: z.string().nullable(),
    content: sectionTextBlockContentSchema,
    position: z.number(),
  }),
]);

export const storeSectionListSchema = z.array(storeSectionSchema);

export type StoreSection = z.infer<typeof storeSectionSchema>;
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
