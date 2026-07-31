import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { OrderRepository } from '../infrastructure/order.repository.js';
import { Order } from '../domain/order.entity.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { MailerService } from '../../../mailer/mailer.service.js';

function buildPaymentStatusEmailHtml(decision: 'approve' | 'reject', storeName: string): string {
  return decision === 'approve'
    ? `
      <p>Tu pago para el pedido en ${storeName} fue aprobado. ¡Gracias por tu compra!</p>
      <hr />
      <p>Your payment for the order at ${storeName} was approved. Thanks for your purchase!</p>
    `
    : `
      <p>Tu pago para el pedido en ${storeName} fue rechazado. Contacta a la tienda para más información.</p>
      <hr />
      <p>Your payment for the order at ${storeName} was rejected. Contact the store for more details.</p>
    `;
}

@Injectable()
export class ReviewPaymentUseCase {
  private readonly logger = new Logger(ReviewPaymentUseCase.name);

  constructor(
    private prisma: PrismaService,
    private orders: OrderRepository,
    private notifications: NotificationsService,
    private mailer: MailerService,
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

    let storeName = '';

    const updated = await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({ where: { id: storeId } });
      storeName = store?.name ?? '';

      for (const item of row.items) {
        if (!item.variantId) continue;
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (!variant || variant.stock === null) continue;

        const updatedVariant = await tx.productVariant.update({
          where: { id: item.variantId },
          data:
            decision === 'approve'
              ? { reserved: { decrement: item.quantity }, stock: { decrement: item.quantity } }
              : { reserved: { decrement: item.quantity } },
        });

        if (store) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (product) await this.notifications.syncStockAlerts(tx, store, product, updatedVariant);
        }
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

    if (row.customerEmail) {
      try {
        await this.mailer.send({
          to: row.customerEmail,
          subject:
            decision === 'approve'
              ? 'Pago aprobado — Bias Market / Payment approved'
              : 'Pago rechazado — Bias Market / Payment rejected',
          html: buildPaymentStatusEmailHtml(decision, storeName),
        });
      } catch (err) {
        this.logger.error(`Failed to send payment status email for order ${orderId}`, err);
      }
    }

    return updated;
  }
}
