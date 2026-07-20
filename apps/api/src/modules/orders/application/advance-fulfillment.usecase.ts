import { Injectable } from '@nestjs/common';
import type { FulfillmentStatus } from '@biasmarket/db';
import { OrderRepository } from '../infrastructure/order.repository.js';
import { Order } from '../domain/order.entity.js';

@Injectable()
export class AdvanceFulfillmentUseCase {
  constructor(private orders: OrderRepository) {}

  async execute(
    orderId: string,
    storeId: string,
    userId: string,
    status: FulfillmentStatus,
  ) {
    await this.orders.assertOwnership(storeId, userId);

    const row = await this.orders.findRowByIdForStore(orderId, storeId);
    const entity = new Order(row.id, row.storeId, row.paymentStatus, row.fulfillmentStatus);

    entity.advanceFulfillment(status);

    return this.orders.saveStatus(orderId, {
      fulfillmentStatus: entity.currentFulfillmentStatus,
    });
  }
}
