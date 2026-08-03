export type AnalyticsRange = "30d" | "90d" | "12m";

export interface AnalyticsBucket {
  start: string;
  end: string;
  revenue: number;
  orderCount: number;
  newCustomers: number;
  returningCustomers: number;
}

export interface AnalyticsTopProduct {
  productId: string;
  name: string;
  unitsSold: number;
}

export interface AnalyticsResult {
  range: AnalyticsRange;
  buckets: AnalyticsBucket[];
  topProducts: AnalyticsTopProduct[];
}
