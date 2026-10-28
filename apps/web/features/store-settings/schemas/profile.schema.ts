import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";

const optionalUrlSchema = z.string().url().optional().or(z.literal(""));

export const profileFormSchema = z.object({
  name: z.string().min(1),
  whatsappNumber: z.string(),
  paymentInstructions: z.string(),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES),
  locale: z.enum(["es", "en"]),
  instagramUrl: optionalUrlSchema,
  facebookUrl: optionalUrlSchema,
  tiktokUrl: optionalUrlSchema,
  twitterUrl: optionalUrlSchema,
  locationLabel: z.string().max(60).optional(),
  publicOwnerName: z.string().max(60).optional(),
});

export type ProfileFormInput = z.infer<typeof profileFormSchema>;
