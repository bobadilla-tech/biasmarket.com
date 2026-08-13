import { Injectable, Logger } from '@nestjs/common';
import type { PaymentStatus } from '@biasmarket/db';
import { Prisma } from '@biasmarket/db';
import { computePaymentSummary } from '../../../common/payment-summary.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';

// Mirrors CancelOrderUseCase's RESERVED_HOLD_STATUSES: all statuses that keep
// stock soft-held (reserved). Orders holding stock past expiresAt must release
// it, regardless of whether the buyer paid a partial deposit.
const RESERVED_HOLD_STATUSES: PaymentStatus[] = [
  'PENDING_PAYMENT',
  'PARTIALLY_PAID',
  'PAYMENT_SUBMITTED',
];

@Injectable()
export class ExpireOrdersUseCase {
  private readonly logger = new Logger(ExpireOrdersUseCase.name);
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async execute() {
    const expired = await this.prisma.order.findMany({
      where: {
        paymentStatus: { in: RESERVED_HOLD_STATUSES },
        expiresAt: { lt: new Date() },
      },
      include: { items: true, payments: true },
    });

    let cancelled = 0;

    for (const order of expired) {
      // Default policy on auto-expiry: retain whatever the buyer already paid
      // (partial deposit). The seller can refund it out-of-band; the recorded
      // resolution keeps the money traceable, consistent with the manual
      // cancel flow's retained/released accounting.
      const { paidAmount } = computePaymentSummary(
        order.requiredAmount,
        order.payments,
      );

      try {
        await this.prisma.$transaction(async (tx) => {
          // Guard against a seller decision (verify/reject) landing between
          // findMany and this transaction: only cancel if still holding a
          // reserved status, otherwise skip stock mutation entirely instead of
          // double-applying it.
          const guard = await tx.order.updateMany({
            where: {
              id: order.id,
              paymentStatus: { in: RESERVED_HOLD_STATUSES },
            },
            data: {
              status: 'CANCELLED',
              paymentStatus: 'CANCELLED',
              cancellationResolution: 'RETAINED',
              retainedAmount: new Prisma.Decimal(paidAmount),
              releasedAmount: new Prisma.Decimal(0),
              releasedResolution: null,
            },
          });
          if (guard.count === 0) return;
          cancelled++;

          await tx.auditLog.create({
            data: {
              actorId: 'system',
              storeId: order.storeId,
              action: 'order.expired',
              entityType: 'Order',
              entityId: order.id,
              metadata: {
                resolution: 'RETAINED',
                retainedAmount: paidAmount,
                releasedAmount: 0,
              },
            },
          });

          const store = await tx.store.findUnique({
            where: { id: order.storeId },
          });
          for (const item of order.items) {
            if (!item.variantId) continue;
            const variant = await tx.productVariant.findUnique({
              where: { id: item.variantId },
            });
            if (!variant || variant.stock === null) continue;
            const updatedVariant = await tx.productVariant.update({
              where: { id: item.variantId },
              data: { reserved: { decrement: item.quantity } },
            });
            if (store) {
              const product = await tx.product.findUnique({
                where: { id: item.productId },
              });
              if (product) {
                await this.notifications.syncStockAlerts(
                  tx,
                  store,
                  product,
                  updatedVariant,
                );
              }
            }
          }
        });
      } catch (error) {
        // Keep sweeping the rest of the batch even if one order fails.
        this.logger.error(
          `Failed to expire order ${order.id}: ${(error as Error).message}`,
        );
      }
    }

    return { cancelled };
  }
}
