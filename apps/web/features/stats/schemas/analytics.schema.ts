export const analyticsRangeValues = ["30d", "90d", "12m"] as const;
export type AnalyticsRange = (typeof analyticsRangeValues)[number];
