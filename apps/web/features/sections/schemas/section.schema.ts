import { z } from "zod";

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
