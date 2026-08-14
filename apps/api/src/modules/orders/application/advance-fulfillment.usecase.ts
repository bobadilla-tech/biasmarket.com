import { Injectable } from '@nestjs/common';
import type { FulfillmentStatus } from '@biasmarket/db';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { OrderRepository } from '../infrastructure/order.repository.js';
import { Order } from '../domain/order.entity.js';

@Injectable()
export class AdvanceFulfillmentUseCase {
  constructor(
    private prisma: PrismaService,
    private orders: OrderRepository,
  ) {}

  async execute(
    orderId: string,
    storeId: string,
    userId: string,
    status: FulfillmentStatus,
  ) {
    await this.orders.assertOwnership(storeId, userId);

    const row = await this.orders.findRowByIdForStore(orderId, storeId);
    const entity = new Order(
      row.id,
      row.storeId,
      row.paymentStatus,
      row.fulfillmentStatus,
    );

    const fromStatus = entity.currentFulfillmentStatus;
    entity.advanceFulfillment(status);
    const toStatus = entity.currentFulfillmentStatus;

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.orders.saveStatus(
        orderId,
        { fulfillmentStatus: toStatus },
        tx,
      );

      await tx.auditLog.create({
        data: {
          actorId: userId,
          storeId,
          action: 'fulfillment.advanced',
          entityType: 'Order',
          entityId: orderId,
          metadata: { fromStatus, toStatus },
        },
      });

      return updated;
    });
  }
}
