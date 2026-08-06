import type {
  AnalyticsBucketResponseDto,
  AnalyticsResultResponseDto,
  AnalyticsTopProductResponseDto,
} from "@biasmarket/types";

export const analyticsRangeValues = ["30d", "90d", "12m"] as const;
export type AnalyticsRange = (typeof analyticsRangeValues)[number];

export type AnalyticsBucket = AnalyticsBucketResponseDto;
export type AnalyticsTopProduct = AnalyticsTopProductResponseDto;
export type AnalyticsResult = AnalyticsResultResponseDto;
