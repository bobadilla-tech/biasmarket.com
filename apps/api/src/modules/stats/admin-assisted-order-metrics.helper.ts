import type { PaymentSource } from "@biasmarket/db";
import { normalizePhone } from "@biasmarket/utils/phone-country";
import {
  countsTowardPaid,
  type SummablePayment,
} from "../../common/payment-summary.js";
import type {
  AdminAssistedOrderMetricsResponseDto,
  AdminAssistedOrderMetricsSummaryDto,
  CurrencyAmountDto,
  FunnelMomentMetricsDto,
  PaymentSourceBreakdownDto,
  StoreRepeatBuyerMetricsDto,
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
  currency?: string | null;
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

type FunnelStage = "shown" | "clicked" | "dismissed" | "claimed";

const EVENT_TYPE_TO_STAGE: Record<string, FunnelStage | undefined> = {
  INVITE_SHOWN: "shown",
  INVITE_CLICKED: "clicked",
  INVITE_DISMISSED: "dismissed",
  CLAIMED: "claimed",
};

interface FunnelSets {
  shown: Set<string>;
  clicked: Set<string>;
  dismissed: Set<string>;
  claimed: Set<string>;
}

function emptyFunnelSets(): FunnelSets {
  return {
    shown: new Set(),
    clicked: new Set(),
    dismissed: new Set(),
    claimed: new Set(),
  };
}

interface WeekBucket {
  weekStartDate: string;
  storeId: string;
  storeName: string;
  assistedOrdersCount: number;
  marketplaceOrdersCount: number;
  assistedRevenue: Map<string, number>;
  marketplaceRevenue: Map<string, number>;
  buyerCounts: Map<string, number>;
}

interface StoreBucket {
  storeId: string;
  storeName: string;
  buyerCounts: Map<string, number>;
}

/**
 * Running totals for one metrics response. The service folds id-cursor pages
 * into one accumulator and drops each page, so a full-history request does not
 * keep every order and payment row at once.
 */
export interface MetricsAccumulator {
  totalAssistedOrders: number;
  totalMarketplaceOrders: number;
  linkOpenedCount: number;
  totalClaimedCount: number;
  ordersWithValidatedPaymentCount: number;
  claimedWithValidatedPaymentCount: number;
  confirmedReceivedCount: number;
  assistedDurations: number[];
  marketplaceDurations: number[];
  assistedPayments: Array<{ source: PaymentSource; voidedAt?: Date | null }>;
  buyerNotifiedOrderIds: Set<string>;
  funnelByMoment: Map<FunnelMoment, FunnelSets>;
  funnelTotals: FunnelSets;
  weeks: Map<string, WeekBucket>;
  stores: Map<string, StoreBucket>;
}

export function createMetricsAccumulator(): MetricsAccumulator {
  const funnelByMoment = new Map<FunnelMoment, FunnelSets>();
  for (const moment of ALL_FUNNEL_MOMENTS) {
    funnelByMoment.set(moment, emptyFunnelSets());
  }
  return {
    totalAssistedOrders: 0,
    totalMarketplaceOrders: 0,
    linkOpenedCount: 0,
    totalClaimedCount: 0,
    ordersWithValidatedPaymentCount: 0,
    claimedWithValidatedPaymentCount: 0,
    confirmedReceivedCount: 0,
    assistedDurations: [],
    marketplaceDurations: [],
    assistedPayments: [],
    buyerNotifiedOrderIds: new Set(),
    funnelByMoment,
    funnelTotals: emptyFunnelSets(),
    weeks: new Map(),
    stores: new Map(),
  };
}

function firstValidPaymentMinutes(order: MetricOrderRow): number | null {
  const validPayments = order.payments.filter(countsTowardPaid);
  if (validPayments.length === 0) return null;

  const earliestPaymentMs = Math.min(
    ...validPayments.map((payment) => {
      const timestamp =
        payment.source === "SELLER_RECORDED"
          ? (payment.paidAt ?? payment.createdAt)
          : (payment.reviewedAt ?? payment.paidAt ?? payment.createdAt);
      return new Date(timestamp).getTime();
    }),
  );
  const orderCreatedMs = new Date(order.createdAt).getTime();
  return Math.max(
    0,
    Math.round(((earliestPaymentMs - orderCreatedMs) / 60000) * 10) / 10,
  );
}

function addPaidAmount(
  totals: Map<string, number>,
  payment: MetricOrderPayment,
) {
  if (!countsTowardPaid(payment)) return;
  const currency = payment.currency?.trim() || "PEN";
  totals.set(currency, (totals.get(currency) ?? 0) + Number(payment.amount));
}

export function foldOrders(
  accumulator: MetricsAccumulator,
  orders: MetricOrderRow[],
): void {
  for (const order of orders) {
    const assisted = order.source === "VENDOR_ASSISTED";
    const marketplace = order.source === "MARKETPLACE";

    if (assisted) {
      accumulator.totalAssistedOrders++;
      if (order.linkFirstOpenedAt != null) accumulator.linkOpenedCount++;
      if (order.claimedAt != null) accumulator.totalClaimedCount++;
      if (order.buyerConfirmedReceivedAt != null) {
        accumulator.confirmedReceivedCount++;
      }
      if (order.payments.some(countsTowardPaid)) {
        accumulator.ordersWithValidatedPaymentCount++;
        if (order.claimedAt != null) {
          accumulator.claimedWithValidatedPaymentCount++;
        }
      }
      for (const payment of order.payments) {
        accumulator.assistedPayments.push({
          source: payment.source,
          voidedAt: payment.voidedAt,
        });
      }
    } else if (marketplace) {
      accumulator.totalMarketplaceOrders++;
    }

    const duration = firstValidPaymentMinutes(order);
    if (duration != null) {
      if (assisted) accumulator.assistedDurations.push(duration);
      else if (marketplace) accumulator.marketplaceDurations.push(duration);
    }

    const weekStartDate = getUtcWeekStartDate(new Date(order.createdAt));
    const key = `${weekStartDate}:${order.storeId}`;
    let week = accumulator.weeks.get(key);
    if (!week) {
      week = {
        weekStartDate,
        storeId: order.storeId,
        storeName: order.store?.name ?? order.storeId,
        assistedOrdersCount: 0,
        marketplaceOrdersCount: 0,
        assistedRevenue: new Map(),
        marketplaceRevenue: new Map(),
        buyerCounts: new Map(),
      };
      accumulator.weeks.set(key, week);
    }
    if (assisted) week.assistedOrdersCount++;
    if (marketplace) week.marketplaceOrdersCount++;

    const revenue = assisted
      ? week.assistedRevenue
      : marketplace
        ? week.marketplaceRevenue
        : null;
    if (revenue) {
      for (const payment of order.payments) addPaidAmount(revenue, payment);
    }

    const buyerKey = getBuyerKey(order);
    week.buyerCounts.set(buyerKey, (week.buyerCounts.get(buyerKey) ?? 0) + 1);

    let store = accumulator.stores.get(order.storeId);
    if (!store) {
      store = {
        storeId: order.storeId,
        storeName: order.store?.name ?? order.storeId,
        buyerCounts: new Map(),
      };
      accumulator.stores.set(order.storeId, store);
    }
    store.buyerCounts.set(buyerKey, (store.buyerCounts.get(buyerKey) ?? 0) + 1);
  }
}

export function foldEvents(
  accumulator: MetricsAccumulator,
  events: MetricOrderEventRow[],
): void {
  for (const event of events) {
    if (event.type === "BUYER_NOTIFIED") {
      accumulator.buyerNotifiedOrderIds.add(event.orderId);
    }
    const stage = EVENT_TYPE_TO_STAGE[event.type];
    if (!stage) continue;
    const moment = resolveMoment(event.payload);
    accumulator.funnelByMoment.get(moment)?.[stage].add(event.orderId);
    accumulator.funnelTotals[stage].add(event.orderId);
  }
}

function funnelMoment(
  moment: string,
  sets: FunnelSets,
): FunnelMomentMetricsDto {
  return {
    moment,
    shownCount: sets.shown.size,
    clickedCount: sets.clicked.size,
    dismissedCount: sets.dismissed.size,
    claimedCount: sets.claimed.size,
  };
}

function currencyAmounts(totals: Map<string, number>): CurrencyAmountDto[] {
  return [...totals.entries()]
    .map(([currency, amount]) => ({
      currency,
      amount: Math.round(amount * 100) / 100,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function summarizeBuyerCounts(buyerCounts: Map<string, number>): {
  distinctBuyers: number;
  repeatBuyers: number;
  repeatBuyerRate: number;
} {
  const distinctBuyers = buyerCounts.size;
  let repeatBuyers = 0;
  for (const count of buyerCounts.values()) {
    if (count >= 2) repeatBuyers++;
  }
  return {
    distinctBuyers,
    repeatBuyers,
    repeatBuyerRate: distinctBuyers > 0 ? repeatBuyers / distinctBuyers : 0,
  };
}

export function finalizeMetrics(
  accumulator: MetricsAccumulator,
): AdminAssistedOrderMetricsResponseDto {
  const { totalAssistedOrders, ordersWithValidatedPaymentCount } = accumulator;
  const validatedClaimRate =
    ordersWithValidatedPaymentCount > 0
      ? accumulator.claimedWithValidatedPaymentCount /
        ordersWithValidatedPaymentCount
      : 0;
  const targetClaimRateHypothesis = TARGET_CLAIM_RATE_HYPOTHESIS;
  // Guardrail: must be strictly false if 0 validated payment orders exist
  const belowTargetClaimRate =
    ordersWithValidatedPaymentCount > 0 &&
    validatedClaimRate < targetClaimRateHypothesis;

  const timeToFirstValidPayment: TimeToPaymentSummaryDto = {
    assistedAvgMinutes: computeAvg(accumulator.assistedDurations),
    assistedMedianMinutes: computeMedian(accumulator.assistedDurations),
    marketplaceAvgMinutes: computeAvg(accumulator.marketplaceDurations),
    marketplaceMedianMinutes: computeMedian(accumulator.marketplaceDurations),
  };

  const summary: AdminAssistedOrderMetricsSummaryDto = {
    totalAssistedOrders,
    totalMarketplaceOrders: accumulator.totalMarketplaceOrders,
    linkOpenedCount: accumulator.linkOpenedCount,
    linkOpenedRate:
      totalAssistedOrders > 0
        ? accumulator.linkOpenedCount / totalAssistedOrders
        : 0,
    totalClaimedCount: accumulator.totalClaimedCount,
    overallClaimRate:
      totalAssistedOrders > 0
        ? accumulator.totalClaimedCount / totalAssistedOrders
        : 0,
    ordersWithValidatedPaymentCount,
    claimedWithValidatedPaymentCount:
      accumulator.claimedWithValidatedPaymentCount,
    validatedClaimRate,
    targetClaimRateHypothesis,
    belowTargetClaimRate,
    buyerNoticeCount: accumulator.buyerNotifiedOrderIds.size,
    buyerNoticeRate:
      totalAssistedOrders > 0
        ? accumulator.buyerNotifiedOrderIds.size / totalAssistedOrders
        : 0,
    confirmedReceivedCount: accumulator.confirmedReceivedCount,
    confirmedReceivedRate:
      totalAssistedOrders > 0
        ? accumulator.confirmedReceivedCount / totalAssistedOrders
        : 0,
    timeToFirstValidPayment,
    paymentSources: computePaymentSources(accumulator.assistedPayments),
  };

  const weeklyStoreBreakdown: WeeklyStoreBreakdownDto[] = [
    ...accumulator.weeks.values(),
  ].map((week) => ({
    weekStartDate: week.weekStartDate,
    storeId: week.storeId,
    storeName: week.storeName,
    assistedOrdersCount: week.assistedOrdersCount,
    marketplaceOrdersCount: week.marketplaceOrdersCount,
    assistedRevenueByCurrency: currencyAmounts(week.assistedRevenue),
    marketplaceRevenueByCurrency: currencyAmounts(week.marketplaceRevenue),
    ...summarizeBuyerCounts(week.buyerCounts),
  }));

  weeklyStoreBreakdown.sort((a, b) => {
    if (a.weekStartDate !== b.weekStartDate) {
      return b.weekStartDate.localeCompare(a.weekStartDate);
    }
    return a.storeName.localeCompare(b.storeName);
  });

  const repeatBuyersByStore: StoreRepeatBuyerMetricsDto[] = [
    ...accumulator.stores.values(),
  ]
    .map((store) => ({
      storeId: store.storeId,
      storeName: store.storeName,
      ...summarizeBuyerCounts(store.buyerCounts),
    }))
    .sort(
      (a, b) =>
        b.repeatBuyerRate - a.repeatBuyerRate ||
        a.storeName.localeCompare(b.storeName),
    );

  return {
    summary,
    invitationFunnel: {
      byMoment: ALL_FUNNEL_MOMENTS.map((moment) =>
        funnelMoment(moment, accumulator.funnelByMoment.get(moment)!),
      ),
      totals: funnelMoment("total", accumulator.funnelTotals),
    },
    weeklyStoreBreakdown,
    repeatBuyersByStore,
  };
}

/**
 * Aggregates invitation funnel events by moment. Stage totals count distinct
 * orders across every moment, so one order shown twice is one shown order.
 */
export function aggregateInvitationFunnel(events: MetricOrderEventRow[]) {
  const accumulator = createMetricsAccumulator();
  foldEvents(accumulator, events);
  return finalizeMetrics(accumulator).invitationFunnel;
}

/**
 * Pure calculation function for all 8 assisted order pilot metrics.
 */
export function calculateAdminAssistedOrderMetrics(
  orders: MetricOrderRow[],
  events: MetricOrderEventRow[],
): AdminAssistedOrderMetricsResponseDto {
  const accumulator = createMetricsAccumulator();
  foldOrders(accumulator, orders);
  foldEvents(accumulator, events);
  return finalizeMetrics(accumulator);
}
