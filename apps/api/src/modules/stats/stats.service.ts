import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@biasmarket/db';
import type {
  FulfillmentStatus,
  PaymentMethodType,
  PaymentStatus,
} from '@biasmarket/db';
import {
  countsTowardPaid,
  REVENUE_ORDER_PAYMENT_STATUSES,
  withPaymentSummary,
} from '../../common/payment-summary.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { buildBuckets } from './analytics-buckets.js';
import type {
  AnalyticsRange,
  AnalyticsResult,
  PaymentMethodBreakdownRow,
  PaymentMethodsBreakdown,
} from './analytics.types.js';

const TOP_PRODUCTS_LIMIT = 5;

const KNOWN_PAYMENT_METHODS: PaymentMethodType[] = [
  'YAPE',
  'PLIN',
  'TRANSFER',
  'CASH',
];

const PAYMENT_STATUSES: PaymentStatus[] = [
  'PENDING_PAYMENT',
  'PARTIALLY_PAID',
  'PAYMENT_SUBMITTED',
  'VERIFIED',
  'REJECTED',
  'CANCELLED',
];

const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  'ORDERING',
  'IN_TRANSIT',
  'READY',
  'COMPLETED',
];

const RECENT_ORDERS_LIMIT = 10;

// Bound on how many outstanding partial payments the "Outstanding partial
// payments" summary card resolves with their full `payments` include — the
// dashboard only ever shows the most recent ones, and loading the whole table
// for a large store would be a wasted full include (see the `payment-summary.ts`
// note on bounded payment includes).
const PARTIAL_PAYMENTS_LIMIT = 20;

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  private async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return store;
  }

  async getOverview(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);

    const [
      revenueAggregate,
      paymentGroups,
      fulfillmentGroups,
      lowStockCount,
      recentOrdersRaw,
      partialPaymentOrdersRaw,
    ] = await Promise.all([
      this.prisma.orderPayment.aggregate({
        where: {
          storeId,
          // Must mirror `countsTowardPaid` in common/payment-summary.ts.
          voidedAt: null,
          OR: [{ source: 'SELLER_RECORDED' }, { reviewStatus: 'APPROVED' }],
          order: {
            paymentStatus: { in: [...REVENUE_ORDER_PAYMENT_STATUSES] },
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.order.groupBy({
        by: ['paymentStatus'],
        where: { storeId },
        _count: true,
      }),
      this.prisma.order.groupBy({
        by: ['fulfillmentStatus'],
        where: { storeId },
        _count: true,
      }),
      this.prisma.notification.count({
        where: {
          storeId,
          archived: false,
          type: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] },
        },
      }),
      this.prisma.order.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: RECENT_ORDERS_LIMIT,
        include: {
          items: { include: { product: true, variant: true } },
          payments: { orderBy: { createdAt: 'desc' } },
          createdBy: { select: { name: true } },
        },
      }),
      // Every order still collecting money, with the same per-order
      // paid/total/remaining summary the Order Details view shows — feeds
      // the "Outstanding partial payments" card in the Summary view.
      // Matches `countsTowardRevenue`: PARTIALLY_PAID and VERIFIED are the
      // money-carrying statuses. A VERIFIED order approved on a deposit (or
      // a legacy pre-guard order) still has pendingAmount > 0 and must stay
      // visible so the seller can chase and collect the remainder.
      this.prisma.order.findMany({
        where: {
          storeId,
          paymentStatus: { in: [...REVENUE_ORDER_PAYMENT_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
        include: { payments: { orderBy: { createdAt: 'desc' } } },
        take: PARTIAL_PAYMENTS_LIMIT,
      }),
    ]);

    const paymentStatusCounts = Object.fromEntries(
      PAYMENT_STATUSES.map((status) => [
        status,
        paymentGroups.find((g) => g.paymentStatus === status)?._count ?? 0,
      ]),
    ) as Record<PaymentStatus, number>;

    const fulfillmentStatusCounts = Object.fromEntries(
      FULFILLMENT_STATUSES.map((status) => [
        status,
        fulfillmentGroups.find((g) => g.fulfillmentStatus === status)?._count ??
          0,
      ]),
    ) as Record<FulfillmentStatus, number>;

    const totalOrders = Object.values(paymentStatusCounts).reduce(
      (sum, n) => sum + n,
      0,
    );

    return {
      revenue: revenueAggregate._sum.amount?.toNumber() ?? 0,
      totalOrders,
      paymentStatusCounts,
      fulfillmentStatusCounts,
      lowStockCount,
      recentOrders: recentOrdersRaw.map((order) => withPaymentSummary(order)),
      partialPaymentOrders: partialPaymentOrdersRaw
        .map((order) => withPaymentSummary(order))
        // A VERIFIED row with its balance settled (rare: a deposit order whose
        // remainder was later covered without an intermediate status change)
        // no longer owes money — drop it so the card only lists what's owed.
        .filter((order) => order.pendingAmount > 0),
    };
  }

  async getAnalytics(
    storeId: string,
    userId: string,
    range: AnalyticsRange,
  ): Promise<AnalyticsResult> {
    await this.assertOwnership(storeId, userId);

    const buckets = buildBuckets(range);
    const rangeStart = buckets[0].start;
    const rangeEnd = buckets[buckets.length - 1].end;

    const [rangeOrders, allCustomerOrders, topProductRows, rangePayments] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { storeId, createdAt: { gte: rangeStart, lt: rangeEnd } },
          select: {
            customerId: true,
            createdAt: true,
          },
        }),
        this.prisma.order.findMany({
          where: { storeId, customerId: { not: null } },
          select: { customerId: true, createdAt: true },
        }),
        this.prisma.orderItem.groupBy({
          by: ['productId'],
          where: {
            storeId,
            order: { createdAt: { gte: rangeStart, lt: rangeEnd } },
          },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: TOP_PRODUCTS_LIMIT,
        }),
        // Revenue follows the payment timestamp, not the order timestamp: a
        // payment collected inside the range for an order placed earlier (or
        // a deposit order settled inside the range) belongs in the bucket of
        // the day it was actually received. Mirrors the overview revenue
        // predicate — only `countsTowardPaid` rows on orders in
        // REVENUE_ORDER_PAYMENT_STATUSES — so unreviewed PENDING_REVIEW
        // proofs and rejected proofs never inflate a bucket.
        this.prisma.orderPayment.findMany({
          where: {
            storeId,
            OR: [
              { paidAt: { gte: rangeStart, lt: rangeEnd } },
              {
                paidAt: null,
                createdAt: { gte: rangeStart, lt: rangeEnd },
              },
            ],
            order: {
              paymentStatus: { in: [...REVENUE_ORDER_PAYMENT_STATUSES] },
            },
          },
          select: {
            amount: true,
            createdAt: true,
            paidAt: true,
            source: true,
            reviewStatus: true,
            voidedAt: true,
          },
        }),
      ]);

    // The customer a bucket's orders belong to is only "returning" if they
    // have ordered before — determined from this store's FULL order history,
    // not just the orders inside the requested range (a customer whose only
    // prior order predates the range must still show as returning, not new).
    const firstOrderAtByCustomer = new Map<string, Date>();
    for (const order of allCustomerOrders) {
      const customerId = order.customerId as string;
      const existing = firstOrderAtByCustomer.get(customerId);
      if (!existing || order.createdAt < existing) {
        firstOrderAtByCustomer.set(customerId, order.createdAt);
      }
    }

    const analyticsBuckets = buckets.map(({ start, end }) => {
      const ordersInBucket = rangeOrders.filter(
        (order) => order.createdAt >= start && order.createdAt < end,
      );

      const revenue = rangePayments
        .filter((payment) => {
          const paidAt = payment.paidAt ?? payment.createdAt;
          return countsTowardPaid(payment) && paidAt >= start && paidAt < end;
        })
        .reduce(
          (sum, payment) => sum.plus(payment.amount),
          new Prisma.Decimal(0),
        )
        .toNumber();

      const customersInBucket = new Set(
        ordersInBucket
          .map((order) => order.customerId)
          .filter((id): id is string => !!id),
      );

      let newCustomers = 0;
      let returningCustomers = 0;
      for (const customerId of customersInBucket) {
        const firstOrderAt = firstOrderAtByCustomer.get(customerId);
        if (firstOrderAt && firstOrderAt >= start && firstOrderAt < end) {
          newCustomers += 1;
        } else {
          returningCustomers += 1;
        }
      }

      return {
        start: start.toISOString(),
        end: end.toISOString(),
        revenue,
        orderCount: ordersInBucket.length,
        newCustomers,
        returningCustomers,
      };
    });

    const productIds = topProductRows.map((row) => row.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productNameById = new Map(products.map((p) => [p.id, p.name]));

    const topProducts = topProductRows.map((row) => ({
      productId: row.productId,
      name: productNameById.get(row.productId) ?? '',
      unitsSold: row._sum.quantity ?? 0,
    }));

    return { range, buckets: analyticsBuckets, topProducts };
  }

  async getPaymentMethodsBreakdown(
    storeId: string,
    userId: string,
    from: Date,
    to: Date,
  ): Promise<PaymentMethodsBreakdown> {
    await this.assertOwnership(storeId, userId);

    const payments = await this.prisma.orderPayment.findMany({
      where: {
        storeId,
        OR: [
          { paidAt: { gte: from, lt: to } },
          { paidAt: null, createdAt: { gte: from, lt: to } },
        ],
        order: { status: 'ACTIVE' },
      },
      select: {
        method: true,
        amount: true,
        paidAt: true,
        source: true,
        reviewStatus: true,
        voidedAt: true,
      },
    });

    const totalsByMethod = new Map<
      PaymentMethodType | null,
      { amount: Prisma.Decimal; count: number }
    >();
    for (const payment of payments.filter(countsTowardPaid)) {
      const current = totalsByMethod.get(payment.method) ?? {
        amount: new Prisma.Decimal(0),
        count: 0,
      };
      totalsByMethod.set(payment.method, {
        amount: current.amount.plus(payment.amount),
        count: current.count + 1,
      });
    }

    const totalAmountDecimal = [...totalsByMethod.values()].reduce(
      (sum, row) => sum.plus(row.amount),
      new Prisma.Decimal(0),
    );
    const totalAmount = totalAmountDecimal.toNumber();
    const totalCount = [...totalsByMethod.values()].reduce(
      (sum, row) => sum + row.count,
      0,
    );

    const percentageOf = (amount: Prisma.Decimal) =>
      totalAmountDecimal.greaterThan(0)
        ? amount.dividedBy(totalAmountDecimal).times(100).toNumber()
        : 0;

    const byMethod: PaymentMethodBreakdownRow[] = KNOWN_PAYMENT_METHODS.map(
      (method) => {
        const row = totalsByMethod.get(method);
        const amount = row?.amount ?? new Prisma.Decimal(0);
        return {
          method,
          amount: amount.toNumber(),
          count: row?.count ?? 0,
          percentage: percentageOf(amount),
        };
      },
    );

    for (const [method, row] of totalsByMethod) {
      if (method !== null && KNOWN_PAYMENT_METHODS.includes(method)) {
        continue;
      }
      const amount = row.amount;
      byMethod.push({
        method,
        amount: amount.toNumber(),
        count: row.count,
        percentage: percentageOf(amount),
      });
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalAmount,
      totalCount,
      byMethod,
    };
  }
}
