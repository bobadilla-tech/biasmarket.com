export interface AdminAssistedOrderMetricsQuery {
  from?: string;
  to?: string;
  storeId?: string;
}

export interface TimeToPaymentSummary {
  assistedAvgMinutes: number | null;
  assistedMedianMinutes: number | null;
  marketplaceAvgMinutes: number | null;
  marketplaceMedianMinutes: number | null;
}

export interface PaymentSourceBreakdown {
  sellerRecordedCount: number;
  buyerSubmittedCount: number;
  sellerRecordedRate: number;
  buyerSubmittedRate: number;
}

export interface FunnelMomentMetrics {
  moment: string;
  shownCount: number;
  clickedCount: number;
  dismissedCount: number;
  claimedCount: number;
}

export interface InvitationFunnelMetrics {
  byMoment: FunnelMomentMetrics[];
  totals: FunnelMomentMetrics;
}

export interface WeeklyStoreBreakdown {
  weekStartDate: string;
  storeId: string;
  storeName: string;
  assistedOrdersCount: number;
  marketplaceOrdersCount: number;
  assistedRevenue: number;
  marketplaceRevenue: number;
  distinctBuyers: number;
  repeatBuyers: number;
  repeatBuyerRate: number;
}

export interface AdminAssistedOrderMetricsSummary {
  totalAssistedOrders: number;
  totalMarketplaceOrders: number;
  linkOpenedCount: number;
  linkOpenedRate: number;
  totalClaimedCount: number;
  overallClaimRate: number;
  ordersWithValidatedPaymentCount: number;
  claimedWithValidatedPaymentCount: number;
  validatedClaimRate: number;
  targetClaimRateHypothesis: number;
  belowTargetClaimRate: boolean;
  buyerNoticeCount: number;
  buyerNoticeRate: number;
  confirmedReceivedCount: number;
  confirmedReceivedRate: number;
  timeToFirstValidPayment: TimeToPaymentSummary;
  paymentSources: PaymentSourceBreakdown;
}

export interface AdminAssistedOrderMetricsResponse {
  summary: AdminAssistedOrderMetricsSummary;
  invitationFunnel: InvitationFunnelMetrics;
  weeklyStoreBreakdown: WeeklyStoreBreakdown[];
}

function apiUrl(): string {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "")
  );
}

export const adminMetricsApi = {
  async getAssistedOrderMetrics(
    query?: AdminAssistedOrderMetricsQuery,
    fallbackErrorMessage?: string,
  ): Promise<AdminAssistedOrderMetricsResponse> {
    const searchParams = new URLSearchParams();
    if (query?.from) searchParams.set("from", query.from);
    if (query?.to) searchParams.set("to", query.to);
    if (query?.storeId) searchParams.set("storeId", query.storeId);
    const qs = searchParams.toString();
    const url = `${apiUrl()}/api/admin/stats/assisted-orders${qs ? `?${qs}` : ""}`;

    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(
        typeof data?.message === "string"
          ? data.message
          : (fallbackErrorMessage ?? "Error loading assisted order metrics"),
      );
    }

    return (await res.json()) as AdminAssistedOrderMetricsResponse;
  },
};
