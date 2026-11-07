import { apiClient } from "@/lib/api-client";
import type {
  AdminAssistedOrderMetricsResponseDto,
  AdminAssistedOrderMetricsSummaryDto,
  AdminStatsControllergetAssistedOrderMetricsParams,
  FunnelMomentMetricsDto,
  InvitationFunnelMetricsDto,
  PaymentSourceBreakdownDto,
  TimeToPaymentSummaryDto,
  WeeklyStoreBreakdownDto,
} from "@biasmarket/types";

export type AdminAssistedOrderMetricsQuery =
  AdminStatsControllergetAssistedOrderMetricsParams;
export type TimeToPaymentSummary = TimeToPaymentSummaryDto;
export type PaymentSourceBreakdown = PaymentSourceBreakdownDto;
export type FunnelMomentMetrics = FunnelMomentMetricsDto;
export type InvitationFunnelMetrics = InvitationFunnelMetricsDto;
export type WeeklyStoreBreakdown = WeeklyStoreBreakdownDto;
export type AdminAssistedOrderMetricsSummary =
  AdminAssistedOrderMetricsSummaryDto;
export type AdminAssistedOrderMetricsResponse =
  AdminAssistedOrderMetricsResponseDto;

/**
 * Admin metrics client delegating to the generated OpenAPI stats SDK.
 */
export const adminMetricsApi = {
  getAssistedOrderMetrics(
    query?: AdminAssistedOrderMetricsQuery,
    fallbackErrorMessage?: string,
  ): Promise<AdminAssistedOrderMetricsResponse> {
    return apiClient.stats.getAssistedOrderMetrics(query, {
      fallbackErrorMessage,
    });
  },
};
