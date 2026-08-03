import { z } from "zod";

export const variantSchema = z.object({
  id: z.string(),
  name: z.string(),
  stock: z.number().nullable(),
  reserved: z.number(),
  priceOverride: z.string().nullable(),
  imageOverride: z.string().nullable(),
  attributes: z.record(z.string(), z.string()),
});

export const variantListSchema = z.array(variantSchema);

export type Variant = z.infer<typeof variantSchema>;

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
