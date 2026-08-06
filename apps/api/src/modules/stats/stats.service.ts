import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  FulfillmentStatus,
  PaymentMethodType,
  PaymentStatus,
  Prisma,
} from "@biasmarket/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { buildBuckets } from "./analytics-buckets.js";
import type {
  AnalyticsRange,
  AnalyticsResult,
  PaymentMethodBreakdownRow,
  PaymentMethodsBreakdown,
} from "./analytics.types.js";

const TOP_PRODUCTS_LIMIT = 5;

const KNOWN_PAYMENT_METHODS: PaymentMethodType[] = [
  "YAPE",
  "PLIN",
  "TRANSFER",
  "CASH",
];

const PAYMENT_STATUSES: PaymentStatus[] = [
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PAYMENT_SUBMITTED",
  "VERIFIED",
  "REJECTED",
  "CANCELLED",
];

const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  "ORDERING",
  "IN_TRANSIT",
  "READY",
  "COMPLETED",
];

const RECENT_ORDERS_LIMIT = 10;

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  private async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No sos dueño de esta store");
    }
    return store;
  }

  private withPaymentSummary<
    T extends {
      requiredAmount: Prisma.Decimal;
      payments?: { amount: Prisma.Decimal }[];
    },
  >(order: T) {
    const paid = (order.payments ?? []).reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const required = Number(order.requiredAmount);
    return {
      ...order,
      paidAmount: paid,
      pendingAmount: Math.max(required - paid, 0),
      paidPercentage: required > 0 ? Math.min((paid / required) * 100, 100) : 0,
    };
  }

  async getOverview(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);

    const [
      revenueAgg,
      paymentGroups,
      fulfillmentGroups,
      lowStockCount,
      recentOrdersRaw,
    ] = await Promise.all([
      this.prisma.orderPayment.aggregate({
        where: { storeId, order: { paymentStatus: "VERIFIED" } },
        _sum: { amount: true },
      }),
      this.prisma.order.groupBy({
        by: ["paymentStatus"],
        where: { storeId },
        _count: true,
      }),
      this.prisma.order.groupBy({
        by: ["fulfillmentStatus"],
        where: { storeId },
        _count: true,
      }),
      this.prisma.notification.count({
        where: {
          storeId,
          archived: false,
          type: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
        },
      }),
      this.prisma.order.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: RECENT_ORDERS_LIMIT,
        include: {
          items: { include: { product: true, variant: true } },
          payments: { orderBy: { createdAt: "desc" } },
        },
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
      revenue: Number(revenueAgg._sum.amount ?? 0),
      totalOrders,
      paymentStatusCounts,
      fulfillmentStatusCounts,
      lowStockCount,
      recentOrders: recentOrdersRaw.map((order) =>
        this.withPaymentSummary(order)
      ),
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

    const [rangeOrders, allCustomerOrders, topProductRows] = await Promise.all([
      this.prisma.order.findMany({
        where: { storeId, createdAt: { gte: rangeStart, lt: rangeEnd } },
        select: {
          customerId: true,
          createdAt: true,
          paymentStatus: true,
          payments: { select: { amount: true } },
        },
      }),
      this.prisma.order.findMany({
        where: { storeId, customerId: { not: null } },
        select: { customerId: true, createdAt: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          storeId,
          order: { createdAt: { gte: rangeStart, lt: rangeEnd } },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: TOP_PRODUCTS_LIMIT,
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

      const revenue = ordersInBucket
        .filter((order) => order.paymentStatus === "VERIFIED")
        .reduce(
          (sum, order) =>
            sum + order.payments.reduce((s, p) => s + Number(p.amount), 0),
          0,
        );

      const customersInBucket = new Set(
        ordersInBucket.map((order) => order.customerId).filter((
          id,
        ): id is string => !!id),
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
      name: productNameById.get(row.productId) ?? "",
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

    const rows = await this.prisma.orderPayment.groupBy({
      by: ["method"],
      where: {
        storeId,
        createdAt: { gte: from, lt: to },
        order: { status: "ACTIVE" },
      },
      _sum: { amount: true },
      _count: true,
    });

    const totalAmount = rows.reduce(
      (sum, row) => sum + Number(row._sum.amount ?? 0),
      0,
    );
    const totalCount = rows.reduce((sum, row) => sum + row._count, 0);

    const byMethod: PaymentMethodBreakdownRow[] = KNOWN_PAYMENT_METHODS.map(
      (method) => {
        const row = rows.find((r) => r.method === method);
        const amount = Number(row?._sum.amount ?? 0);
        return {
          method,
          amount,
          count: row?._count ?? 0,
          percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
        };
      },
    );

    for (const row of rows) {
      if (row.method !== null && KNOWN_PAYMENT_METHODS.includes(row.method)) {
        continue;
      }
      const amount = Number(row._sum.amount ?? 0);
      byMethod.push({
        method: row.method,
        amount,
        count: row._count,
        percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
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
