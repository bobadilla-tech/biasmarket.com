import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";

export const profileFormSchema = z.object({
  name: z.string().min(1),
  whatsappNumber: z.string().min(1),
  paymentInstructions: z.string(),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES),
});

export type ProfileFormInput = z.infer<typeof profileFormSchema>;
