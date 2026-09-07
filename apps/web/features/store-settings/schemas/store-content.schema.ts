import { z } from "zod";

// Mirrors the API `UpdateStoreDto` caps (`@MaxLength(280)` / `@MaxLength(4000)`).
// Plain text for now — markdown rendering/preview lands in a later PR (D2/D3).
export const BIO_MAX_LENGTH = 280;
export const ABOUT_MARKDOWN_MAX_LENGTH = 4000;

export const storeContentFormSchema = z.object({
  bio: z.string().max(BIO_MAX_LENGTH),
  aboutMarkdown: z.string().max(ABOUT_MARKDOWN_MAX_LENGTH),
});

export type StoreContentFormInput = z.infer<typeof storeContentFormSchema>;
