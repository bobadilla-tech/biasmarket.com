import type { PaymentSource } from "@biasmarket/db";
import { normalizePhone } from "@biasmarket/utils/phone-country";
import {
  countsTowardPaid,
  type SummablePayment,
} from "../../common/payment-summary.js";
import type {
  AdminAssistedOrderMetricsResponseDto,
  AdminAssistedOrderMetricsSummaryDto,
  FunnelMomentMetricsDto,
  InvitationFunnelMetricsDto,
  PaymentSourceBreakdownDto,
  TimeToPaymentSummaryDto,
  WeeklyStoreBreakdownDto,
} from "./dto/admin-assisted-order-metrics.dto.js";

export const TARGET_CLAIM_RATE_HYPOTHESIS = 0.3;

export const VALID_FUNNEL_MOMENTS = [
  "pago_validado",
  "entrega",
  "banner",
  "adelanto_linea_de_tiempo",
] as const;

export type ValidFunnelMoment = (typeof VALID_FUNNEL_MOMENTS)[number];

export const ALL_FUNNEL_MOMENTS = [
  ...VALID_FUNNEL_MOMENTS,
  "unspecified",
] as const;

export type FunnelMoment = (typeof ALL_FUNNEL_MOMENTS)[number];

export interface MetricOrderPayment extends SummablePayment {
  id?: string;
  source: PaymentSource;
  reviewStatus: any;
  paidAt?: Date | null;
  reviewedAt?: Date | null;
  voidedAt?: Date | null;
  amount: any;
  createdAt: Date;
}

export interface MetricOrderRow {
  id: string;
  storeId: string;
  store?: { id: string; name: string } | null;
  source: string;
  customerId?: string | null;
  customerPhoneNormalized?: string | null;
  customerPhone?: string | null;
  buyerAccountId?: string | null;
  linkFirstOpenedAt?: Date | null;
  claimedAt?: Date | null;
  buyerConfirmedReceivedAt?: Date | null;
  createdAt: Date;
  totalAmount?: any;
  payments: MetricOrderPayment[];
}

export interface MetricOrderEventRow {
  orderId: string;
  type: string;
  payload: any;
}

/**
 * Normalizes event moment payload into a known moment or 'unspecified'.
 */
export function resolveMoment(payload: unknown): FunnelMoment {
  if (payload && typeof payload === "object") {
    const moment = (payload as Record<string, unknown>).moment;
    if (
      typeof moment === "string" &&
      VALID_FUNNEL_MOMENTS.includes(moment as ValidFunnelMoment)
    ) {
      return moment as ValidFunnelMoment;
    }
  }
  return "unspecified";
}

/**
 * Resolves Monday of the ISO week in UTC as YYYY-MM-DD.
 */
export function getUtcWeekStartDate(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds an in-memory grouping key for repeat buyers without exposing any PII.
 * Prioritizes normalized phone first, falling back to buyerAccountId, customerId, or orderId.
 */
export function getBuyerKey(order: {
  id: string;
  customerPhoneNormalized?: string | null;
  customerPhone?: string | null;
  customerId?: string | null;
  buyerAccountId?: string | null;
}): string {
  const phone =
    order.customerPhoneNormalized ??
    (order.customerPhone ? normalizePhone(order.customerPhone) : null);
  if (phone) return `phone:${phone}`;
  if (order.buyerAccountId) return `account:${order.buyerAccountId}`;
  if (order.customerId) return `cust:${order.customerId}`;
  return `order:${order.id}`;
}

/**
 * Computes median value of an array of numbers, or null if empty.
 */
export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

/**
 * Computes arithmetic mean of an array of numbers, rounded to 1 decimal place, or null if empty.
 */
export function computeAvg(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * Computes payment source breakdown for active (non-voided) payments.
 * Zero-denominator guard ensures 0.0 when active count is zero.
 */
export function computePaymentSources(
  payments: Array<{ source: PaymentSource; voidedAt?: Date | null }>,
): PaymentSourceBreakdownDto {
  const activePayments = payments.filter((p) => p.voidedAt == null);
  const total = activePayments.length;

  let sellerRecordedCount = 0;
  let buyerSubmittedCount = 0;

  for (const p of activePayments) {
    if (p.source === "SELLER_RECORDED") {
      sellerRecordedCount++;
    } else if (p.source === "BUYER_SUBMITTED") {
      buyerSubmittedCount++;
    }
  }

  const sellerRecordedRate = total > 0 ? sellerRecordedCount / total : 0;
  const buyerSubmittedRate = total > 0 ? buyerSubmittedCount / total : 0;

  return {
    sellerRecordedCount,
    buyerSubmittedCount,
    sellerRecordedRate,
    buyerSubmittedRate,
  };
}

/**
 * Aggregates invitation funnel events by moment, counting distinct orders per stage
 * to maintain monotonicity.
 */
export function aggregateInvitationFunnel(
  events: MetricOrderEventRow[],
): InvitationFunnelMetricsDto {
  const byMoment: FunnelMomentMetricsDto[] = ALL_FUNNEL_MOMENTS.map(
    (moment) => {
      const momentEvents = events.filter(
        (e) => resolveMoment(e.payload) === moment,
      );

      const shownCount = new Set(
        momentEvents
          .filter((e) => e.type === "INVITE_SHOWN")
          .map((e) => e.orderId),
      ).size;
      const clickedCount = new Set(
        momentEvents
          .filter((e) => e.type === "INVITE_CLICKED")
          .map((e) => e.orderId),
      ).size;
      const dismissedCount = new Set(
        momentEvents
          .filter((e) => e.type === "INVITE_DISMISSED")
          .map((e) => e.orderId),
      ).size;
      const claimedCount = new Set(
        momentEvents.filter((e) => e.type === "CLAIMED").map((e) => e.orderId),
      ).size;

      return {
        moment,
        shownCount,
        clickedCount,
        dismissedCount,
        claimedCount,
      };
    },
  );

  const totals: FunnelMomentMetricsDto = byMoment.reduce(
    (acc, m) => ({
      moment: "total",
      shownCount: acc.shownCount + m.shownCount,
      clickedCount: acc.clickedCount + m.clickedCount,
      dismissedCount: acc.dismissedCount + m.dismissedCount,
      claimedCount: acc.claimedCount + m.claimedCount,
    }),
    {
      moment: "total",
      shownCount: 0,
      clickedCount: 0,
      dismissedCount: 0,
      claimedCount: 0,
    },
  );

  return { byMoment, totals };
}

/**
 * Pure calculation function for all 8 assisted order pilot metrics.
 */
export function calculateAdminAssistedOrderMetrics(
  orders: MetricOrderRow[],
  events: MetricOrderEventRow[],
): AdminAssistedOrderMetricsResponseDto {
  const assistedOrders = orders.filter((o) => o.source === "VENDOR_ASSISTED");
  const marketplaceOrders = orders.filter((o) => o.source === "MARKETPLACE");

  const totalAssistedOrders = assistedOrders.length;
  const totalMarketplaceOrders = marketplaceOrders.length;

  // 2. Proportion whose link was opened
  const linkOpenedCount = assistedOrders.filter(
    (o) => o.linkFirstOpenedAt != null,
  ).length;
  const linkOpenedRate =
    totalAssistedOrders > 0 ? linkOpenedCount / totalAssistedOrders : 0;

  // 3. Proportion claimed with Google (overall & validated payment)
  const totalClaimedCount = assistedOrders.filter(
    (o) => o.claimedAt != null,
  ).length;
  const overallClaimRate =
    totalAssistedOrders > 0 ? totalClaimedCount / totalAssistedOrders : 0;

  const ordersWithValidatedPayment = assistedOrders.filter((o) =>
    o.payments.some(countsTowardPaid),
  );
  const ordersWithValidatedPaymentCount = ordersWithValidatedPayment.length;

  const claimedWithValidatedPaymentCount = ordersWithValidatedPayment.filter(
    (o) => o.claimedAt != null,
  ).length;
  const validatedClaimRate =
    ordersWithValidatedPaymentCount > 0
      ? claimedWithValidatedPaymentCount / ordersWithValidatedPaymentCount
      : 0;

  const targetClaimRateHypothesis = TARGET_CLAIM_RATE_HYPOTHESIS;
  // Guardrail: must be strictly false if 0 validated payment orders exist
  const belowTargetClaimRate =
    ordersWithValidatedPaymentCount > 0 &&
    validatedClaimRate < targetClaimRateHypothesis;

  // 5. G1 buyer notice & G3 confirmed reception
  const buyerNotifiedOrderIds = new Set(
    events.filter((e) => e.type === "BUYER_NOTIFIED").map((e) => e.orderId),
  );
  const buyerNoticeCount = buyerNotifiedOrderIds.size;
  const buyerNoticeRate =
    totalAssistedOrders > 0 ? buyerNoticeCount / totalAssistedOrders : 0;

  const confirmedReceivedCount = assistedOrders.filter(
    (o) => o.buyerConfirmedReceivedAt != null,
  ).length;
  const confirmedReceivedRate =
    totalAssistedOrders > 0 ? confirmedReceivedCount / totalAssistedOrders : 0;

  // 7. Time from order creation to first valid payment (duration clamped to >= 0)
  const assistedDurations: number[] = [];
  const marketplaceDurations: number[] = [];

  for (const order of orders) {
    const validPayments = order.payments.filter(countsTowardPaid);
    if (validPayments.length === 0) continue;

    const validTimestamps = validPayments.map((p) => {
      const t =
        p.source === "SELLER_RECORDED"
          ? (p.paidAt ?? p.createdAt)
          : (p.reviewedAt ?? p.paidAt ?? p.createdAt);
      return new Date(t).getTime();
    });

    const earliestPaymentMs = Math.min(...validTimestamps);
    const orderCreatedMs = new Date(order.createdAt).getTime();
    const durationMinutes = Math.max(
      0,
      Math.round(((earliestPaymentMs - orderCreatedMs) / 60000) * 10) / 10,
    );

    if (order.source === "VENDOR_ASSISTED") {
      assistedDurations.push(durationMinutes);
    } else if (order.source === "MARKETPLACE") {
      marketplaceDurations.push(durationMinutes);
    }
  }

  const timeToFirstValidPayment: TimeToPaymentSummaryDto = {
    assistedAvgMinutes: computeAvg(assistedDurations),
    assistedMedianMinutes: computeMedian(assistedDurations),
    marketplaceAvgMinutes: computeAvg(marketplaceDurations),
    marketplaceMedianMinutes: computeMedian(marketplaceDurations),
  };

  // 8. Payment source breakdown (on assisted orders)
  const assistedPayments = assistedOrders.flatMap((o) => o.payments);
  const paymentSources = computePaymentSources(assistedPayments);

  const summary: AdminAssistedOrderMetricsSummaryDto = {
    totalAssistedOrders,
    totalMarketplaceOrders,
    linkOpenedCount,
    linkOpenedRate,
    totalClaimedCount,
    overallClaimRate,
    ordersWithValidatedPaymentCount,
    claimedWithValidatedPaymentCount,
    validatedClaimRate,
    targetClaimRateHypothesis,
    belowTargetClaimRate,
    buyerNoticeCount,
    buyerNoticeRate,
    confirmedReceivedCount,
    confirmedReceivedRate,
    timeToFirstValidPayment,
    paymentSources,
  };

  // 4. Invitation funnel by moment
  const invitationFunnel = aggregateInvitationFunnel(events);

  // 1 & 6. Weekly summary grouped by store with repeat buyers
  const weekStoreMap = new Map<
    string,
    {
      weekStartDate: string;
      storeId: string;
      storeName: string;
      orders: MetricOrderRow[];
    }
  >();

  for (const order of orders) {
    const weekStartDate = getUtcWeekStartDate(new Date(order.createdAt));
    const key = `${weekStartDate}:${order.storeId}`;
    let entry = weekStoreMap.get(key);
    if (!entry) {
      entry = {
        weekStartDate,
        storeId: order.storeId,
        storeName: order.store?.name ?? order.storeId,
        orders: [],
      };
      weekStoreMap.set(key, entry);
    }
    entry.orders.push(order);
  }

  const weeklyStoreBreakdown: WeeklyStoreBreakdownDto[] = [];
  for (const entry of weekStoreMap.values()) {
    const assisted = entry.orders.filter((o) => o.source === "VENDOR_ASSISTED");
    const marketplace = entry.orders.filter((o) => o.source === "MARKETPLACE");

    let assistedRevenue = 0;
    for (const o of assisted) {
      for (const p of o.payments) {
        if (countsTowardPaid(p)) {
          assistedRevenue += Number(p.amount);
        }
      }
    }

    let marketplaceRevenue = 0;
    for (const o of marketplace) {
      for (const p of o.payments) {
        if (countsTowardPaid(p)) {
          marketplaceRevenue += Number(p.amount);
        }
      }
    }

    // Server-side repeat buyer grouping with normalized phone priority (Zero PII exposed)
    const buyerCounts = new Map<string, number>();
    for (const o of entry.orders) {
      const buyerKey = getBuyerKey(o);
      buyerCounts.set(buyerKey, (buyerCounts.get(buyerKey) ?? 0) + 1);
    }

    const distinctBuyers = buyerCounts.size;
    let repeatBuyers = 0;
    for (const count of buyerCounts.values()) {
      if (count >= 2) repeatBuyers++;
    }
    const repeatBuyerRate =
      distinctBuyers > 0 ? repeatBuyers / distinctBuyers : 0;

    weeklyStoreBreakdown.push({
      weekStartDate: entry.weekStartDate,
      storeId: entry.storeId,
      storeName: entry.storeName,
      assistedOrdersCount: assisted.length,
      marketplaceOrdersCount: marketplace.length,
      assistedRevenue: Math.round(assistedRevenue * 100) / 100,
      marketplaceRevenue: Math.round(marketplaceRevenue * 100) / 100,
      distinctBuyers,
      repeatBuyers,
      repeatBuyerRate,
    });
  }

  // Sort by week descending, then store name ascending
  weeklyStoreBreakdown.sort((a, b) => {
    if (a.weekStartDate !== b.weekStartDate) {
      return b.weekStartDate.localeCompare(a.weekStartDate);
    }
    return a.storeName.localeCompare(b.storeName);
  });

  return {
    summary,
    invitationFunnel,
    weeklyStoreBreakdown,
  };
}
