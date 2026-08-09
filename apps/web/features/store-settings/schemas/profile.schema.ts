import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";

const optionalUrlSchema = z.string().url().optional().or(z.literal(""));

export const profileFormSchema = z.object({
  name: z.string().min(1),
  whatsappNumber: z.string().min(1),
  paymentInstructions: z.string(),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES),
  locale: z.enum(["es", "en"]),
  instagramUrl: optionalUrlSchema,
  facebookUrl: optionalUrlSchema,
  tiktokUrl: optionalUrlSchema,
  twitterUrl: optionalUrlSchema,
});

export type ProfileFormInput = z.infer<typeof profileFormSchema>;
