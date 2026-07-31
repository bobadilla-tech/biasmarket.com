import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";

export const createStoreFormSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(1),
  whatsappNumber: z.string().min(6),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES),
});

export type CreateStoreFormInput = z.infer<typeof createStoreFormSchema>;
