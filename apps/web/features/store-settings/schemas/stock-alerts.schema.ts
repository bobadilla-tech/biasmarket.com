import { z } from "zod";

export const stockAlertsFormSchema = z.object({
  lowStockAlertsEnabled: z.boolean(),
  lowStockThreshold: z.coerce.number().min(0),
});

export type StockAlertsFormInput = z.infer<typeof stockAlertsFormSchema>;
