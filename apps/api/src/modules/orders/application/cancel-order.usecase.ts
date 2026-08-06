import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import type { CancellationResolution } from "@biasmarket/db";
import type { PrismaService } from "../../../prisma/prisma.service.js";
import type { OrderRepository } from "../infrastructure/order.repository.js";
import type { NotificationsService } from "../../notifications/notifications.service.js";

const RESERVED_HOLD_STATUSES = new Set([
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PAYMENT_SUBMITTED",
]);

@Injectable()
export class CancelOrderUseCase {
  constructor(
    private prisma: PrismaService,
    private orders: OrderRepository,
    private notifications: NotificationsService,
  ) {}

  async execute(
    orderId: string,
    storeId: string,
    userId: string,
    resolution: CancellationResolution,
    reason?: string,
  ) {
    await this.orders.assertOwnership(storeId, userId);

    const row = await this.orders.findRowByIdForStore(orderId, storeId);

    if (row.status === "CANCELLED") {
      throw new BadRequestException("Esta orden ya está cancelada");
    }
    if (row.fulfillmentStatus === "COMPLETED") {
      throw new BadRequestException(
        "No se puede cancelar una orden ya entregada",
      );
    }

    const releaseStock = RESERVED_HOLD_STATUSES.has(row.paymentStatus);

    return this.prisma.$transaction(async (tx) => {
      // Guard against a concurrent cancel/review of the same order: only
      // proceed if the row is still ACTIVE, same pattern as
      // ReviewPaymentUseCase's updateMany guard.
      const guard = await tx.order.updateMany({
        where: { id: orderId, status: "ACTIVE" },
        data: {
          status: "CANCELLED",
          paymentStatus: "CANCELLED",
          cancellationResolution: resolution,
          cancellationReason: reason ?? null,
        },
      });
      if (guard.count === 0) {
        throw new ConflictException(
          "Este pedido ya fue actualizado por otra solicitud.",
        );
      }

      if (releaseStock) {
        const store = await tx.store.findUnique({ where: { id: storeId } });
        for (const item of row.items) {
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
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          storeId,
          action: "order.cancelled",
          entityType: "Order",
          entityId: orderId,
          metadata: { resolution, reason: reason ?? null },
        },
      });

      return tx.order.findUniqueOrThrow({ where: { id: orderId } });
    });
  }
}
