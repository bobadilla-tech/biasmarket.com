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
  whatsappNumber: z.string().nullable(),
  defaultCurrency: z.string(),
  logoUrl: z.string().nullable().optional(),
  paymentInstructions: z.string().optional(),
  themeConfig: storeThemeConfigSchema.nullable().optional(),
  lowStockThreshold: z.number().optional(),
  lowStockAlertsEnabled: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export type DashboardStore = z.infer<typeof dashboardStoreSchema>;
