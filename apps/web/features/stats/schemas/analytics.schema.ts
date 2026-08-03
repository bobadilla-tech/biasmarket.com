import { z } from "zod";

export const analyticsRangeValues = ["30d", "90d", "12m"] as const;
export type AnalyticsRange = (typeof analyticsRangeValues)[number];

export const analyticsBucketSchema = z.object({
  start: z.string(),
  end: z.string(),
  revenue: z.number(),
  orderCount: z.number(),
  newCustomers: z.number(),
  returningCustomers: z.number(),
});

export const analyticsTopProductSchema = z.object({
  productId: z.string(),
  name: z.string(),
  unitsSold: z.number(),
});

export const analyticsResultSchema = z.object({
  range: z.enum(analyticsRangeValues),
  buckets: z.array(analyticsBucketSchema),
  topProducts: z.array(analyticsTopProductSchema),
});

export type AnalyticsBucket = z.infer<typeof analyticsBucketSchema>;
export type AnalyticsTopProduct = z.infer<typeof analyticsTopProductSchema>;
export type AnalyticsResult = z.infer<typeof analyticsResultSchema>;
