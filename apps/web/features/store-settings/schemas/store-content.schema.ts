import { z } from "zod";

// Mirrors the API `UpdateStoreDto` caps (`@MaxLength(280)` / `@MaxLength(4000)`).
// `aboutMarkdown` is rendered as markdown on the storefront (D2) and previewed
// live in the editor (D3) via the shared `lib/store-markdown` allowlist.
export const BIO_MAX_LENGTH = 280;
export const ABOUT_MARKDOWN_MAX_LENGTH = 4000;

export const storeContentFormSchema = z.object({
  bio: z.string().max(BIO_MAX_LENGTH),
  aboutMarkdown: z.string().max(ABOUT_MARKDOWN_MAX_LENGTH),
});

export type StoreContentFormInput = z.infer<typeof storeContentFormSchema>;
