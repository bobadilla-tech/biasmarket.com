import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { OrderRepository } from '../infrastructure/order.repository.js';
import { Order } from '../domain/order.entity.js';

@Injectable()
export class ReviewPaymentUseCase {
  constructor(
    private prisma: PrismaService,
    private orders: OrderRepository,
  ) {}

  async execute(
    orderId: string,
    storeId: string,
    userId: string,
    decision: 'approve' | 'reject',
  ) {
    await this.orders.assertOwnership(storeId, userId);

    const row = await this.orders.findRowByIdForStore(orderId, storeId);
    const entity = new Order(row.id, row.storeId, row.paymentStatus, row.fulfillmentStatus);

    if (decision === 'approve') {
      entity.approvePayment();
    } else {
      entity.rejectPayment();
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of row.items) {
        if (!item.variantId) continue;
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (!variant || variant.stock === null) continue;

        await tx.productVariant.update({
          where: { id: item.variantId },
          data:
            decision === 'approve'
              ? { reserved: { decrement: item.quantity }, stock: { decrement: item.quantity } }
              : { reserved: { decrement: item.quantity } },
        });
      }

      const updated = await this.orders.saveStatus(
        orderId,
        { paymentStatus: entity.currentPaymentStatus },
        tx,
      );

      await tx.auditLog.create({
        data: {
          actorId: userId,
          storeId,
          action: decision === 'approve' ? 'payment.approved' : 'payment.rejected',
          entityType: 'Order',
          entityId: orderId,
          metadata: {},
        },
      });

      return updated;
    });
  }
}
