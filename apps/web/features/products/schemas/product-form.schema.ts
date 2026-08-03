import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";

export const productFormSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  price: z.string().min(1),
  currency: z.enum(SUPPORTED_CURRENCIES),
  stock: z.string(),
  categoryId: z.string(),
});

export type ProductFormInput = z.infer<typeof productFormSchema>;
