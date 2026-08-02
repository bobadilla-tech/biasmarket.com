import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { FulfillmentStatus, PaymentStatus, Prisma } from '@biasmarket/db';
import { PrismaService } from '../../prisma/prisma.service.js';

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

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  private async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return store;
  }

  private withPaymentSummary<
    T extends { requiredAmount: Prisma.Decimal; payments?: { amount: Prisma.Decimal }[] },
  >(order: T) {
    const paid = (order.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
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

    const [revenueAgg, paymentGroups, fulfillmentGroups, lowStockCount, recentOrdersRaw] =
      await Promise.all([
        this.prisma.orderPayment.aggregate({
          where: { storeId, order: { paymentStatus: 'VERIFIED' } },
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
          where: { storeId, archived: false, type: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] } },
        }),
        this.prisma.order.findMany({
          where: { storeId },
          orderBy: { createdAt: 'desc' },
          take: RECENT_ORDERS_LIMIT,
          include: {
            items: { include: { product: true, variant: true } },
            payments: { orderBy: { createdAt: 'desc' } },
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
        fulfillmentGroups.find((g) => g.fulfillmentStatus === status)?._count ?? 0,
      ]),
    ) as Record<FulfillmentStatus, number>;

    const totalOrders = Object.values(paymentStatusCounts).reduce((sum, n) => sum + n, 0);

    return {
      revenue: Number(revenueAgg._sum.amount ?? 0),
      totalOrders,
      paymentStatusCounts,
      fulfillmentStatusCounts,
      lowStockCount,
      recentOrders: recentOrdersRaw.map((order) => this.withPaymentSummary(order)),
    };
  }
}
