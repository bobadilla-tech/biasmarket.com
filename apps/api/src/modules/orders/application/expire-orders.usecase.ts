import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { NotificationsService } from "../../notifications/notifications.service.js";

@Injectable()
export class ExpireOrdersUseCase {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async execute() {
    const expired = await this.prisma.order.findMany({
      where: {
        paymentStatus: "PENDING_PAYMENT",
        expiresAt: { lt: new Date() },
      },
      include: { items: true },
    });

    let cancelled = 0;

    for (const order of expired) {
      await this.prisma.$transaction(async (tx) => {
        // Guard against a seller decision (verify/reject) landing between
        // findMany and this transaction: only cancel if still PENDING_PAYMENT,
        // otherwise skip stock mutation entirely instead of double-applying it.
        const guard = await tx.order.updateMany({
          where: { id: order.id, paymentStatus: "PENDING_PAYMENT" },
          data: { paymentStatus: "CANCELLED" },
        });
        if (guard.count === 0) return;
        cancelled++;

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
    }

    return { cancelled };
  }
}
