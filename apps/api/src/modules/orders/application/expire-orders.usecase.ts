import { Injectable } from "@nestjs/common";
import type { PrismaService } from "../../../prisma/prisma.service.js";
import type { NotificationsService } from "../../notifications/notifications.service.js";

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

    for (const order of expired) {
      await this.prisma.$transaction(async (tx) => {
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
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: "CANCELLED" },
        });
      });
    }

    return { cancelled: expired.length };
  }
}
