import { z } from "zod";

const storeThemeConfigSchema = z.object({
  paletteId: z.string().optional(),
  colors: z
    .object({
      primary: z.string().optional(),
      accent: z.string().optional(),
      surface: z.string().optional(),
      text: z.string().optional(),
    })
    .optional(),
});

export const dashboardStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  locale: z.string().optional(),
  whatsappNumber: z.string().nullable(),
  instagramUrl: z.string().nullable().optional(),
  facebookUrl: z.string().nullable().optional(),
  tiktokUrl: z.string().nullable().optional(),
  twitterUrl: z.string().nullable().optional(),
  defaultCurrency: z.string(),
  logoUrl: z.string().nullable().optional(),
  paymentInstructions: z.string().optional(),
  themeConfig: storeThemeConfigSchema.nullable().optional(),
  lowStockThreshold: z.number().optional(),
  lowStockAlertsEnabled: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export type DashboardStore = z.infer<typeof dashboardStoreSchema>;
