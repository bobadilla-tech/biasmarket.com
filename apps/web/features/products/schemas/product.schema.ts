import { z } from "zod";
import { categorySchema } from "./category.schema";
import { variantSchema } from "./variant.schema";

export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.string(),
  currency: z.string(),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  soldOut: z.boolean(),
  images: z.array(z.string()),
  availableUntil: z.string().nullable(),
  categories: z.array(z.object({ category: categorySchema })).optional(),
  variants: z.array(variantSchema).optional(),
  availableStock: z.number().nullable().optional(),
  soldUnits: z.number().optional(),
});

export const productListSchema = z.array(productSchema);

export type Product = z.infer<typeof productSchema>;
