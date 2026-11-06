import { Injectable } from "@nestjs/common";
import type { FulfillmentStatus } from "@biasmarket/db";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { OrderRepository } from "../infrastructure/order.repository.js";
import { Order } from "../domain/order.entity.js";
import { OrderEventsService } from "./order-events.service.js";

@Injectable()
export class AdvanceFulfillmentUseCase {
  constructor(
    private prisma: PrismaService,
    private orders: OrderRepository,
    private events: OrderEventsService,
  ) {}

  async execute(
    orderId: string,
    storeId: string,
    userId: string,
    status: FulfillmentStatus,
  ) {
    await this.orders.assertOwnership(storeId, userId);

    return this.prisma.$transaction(async (tx) => {
      const [lockedOrder] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Order"
        WHERE "id" = ${orderId} AND "storeId" = ${storeId}
        FOR UPDATE
      `;
      if (!lockedOrder) {
        const row = await this.orders.findRowByIdForStore(orderId, storeId);
        throw new Error(`Order ${row.id} could not be locked`);
      }
      const row = await tx.order.findFirst({
        where: { id: orderId, storeId },
        select: {
          id: true,
          storeId: true,
          paymentStatus: true,
          fulfillmentStatus: true,
        },
      });
      if (!row) throw new Error("Order not found");
      const entity = new Order(
        row.id,
        row.storeId,
        row.paymentStatus,
        row.fulfillmentStatus,
      );
      const fromStatus = entity.currentFulfillmentStatus;
      entity.advanceFulfillment(status);
      const toStatus = entity.currentFulfillmentStatus;

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          fulfillmentStatus: toStatus,
          ...(toStatus === "COMPLETED" ? { closedAt: new Date() } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          storeId,
          action: "fulfillment.advanced",
          entityType: "Order",
          entityId: orderId,
          metadata: { fromStatus, toStatus },
        },
      });
      await this.events.record(tx, {
        orderId,
        storeId,
        type: "FULFILLMENT_ADVANCED",
        actor: "SELLER",
        payload: { fromStatus, toStatus },
      });

      return updated;
    });
  }
}
