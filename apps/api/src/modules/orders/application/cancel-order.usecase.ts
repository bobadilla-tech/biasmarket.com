import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import type { CancellationResolution } from "@biasmarket/db";
import { CancelOrderDto } from "../dto/cancel-order.dto.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { OrderRepository } from "../infrastructure/order.repository.js";
import { NotificationsService } from "../../notifications/notifications.service.js";

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
    dto: CancelOrderDto,
  ) {
    await this.orders.assertOwnership(storeId, userId);

    const row = await this.orders.findRowByIdForStore(orderId, storeId);
    const paidAmount = row.paidAmount;

    let retainedAmount = 0;
    let releasedAmount = 0;
    let releasedResolution: "REFUNDED" | "STORE_CREDIT" | null = null;

    if (dto.resolution === "RETAINED") {
      if (dto.retainMode === "FULL") {
        retainedAmount = paidAmount;
        releasedAmount = 0;
      }

      if (dto.retainMode === "PARTIAL") {
        if (
          dto.retainedAmount === undefined ||
          dto.retainedAmount > paidAmount
        ) {
          throw new BadRequestException(
            "Monto retenido inválido",
          );
        }

        retainedAmount = dto.retainedAmount;
        releasedAmount = paidAmount - dto.retainedAmount;
        releasedResolution = dto.releasedResolution ?? null;
      }
    } else if (
      dto.resolution === "REFUNDED" || dto.resolution === "STORE_CREDIT"
    ) {
      releasedAmount = paidAmount;
      releasedResolution = dto.resolution;
    }

    if (row.paymentStatus === "CANCELLED") {
      throw new BadRequestException("La orden ya está cancelada");
    }

    if (row.paymentStatus === "REJECTED") {
      throw new BadRequestException(
        "No se puede cancelar una orden con pago rechazado",
      );
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
          cancellationResolution: dto.resolution,
          cancellationReason: dto.reason ?? null,
          retainedAmount,
          releasedAmount,
          releasedResolution,
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
          metadata: {
            resolution: dto.resolution,
            retainMode: dto.retainMode ?? null,
            retainedAmount,
            releasedAmount,
            releasedResolution,
            reason: dto.reason ?? null,
          },
        },
      });

      return tx.order.findUniqueOrThrow({ where: { id: orderId } });
    });
  }
}
