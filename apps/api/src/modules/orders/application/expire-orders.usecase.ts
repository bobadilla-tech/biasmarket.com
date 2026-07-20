import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class ExpireOrdersUseCase {
  constructor(private prisma: PrismaService) {}

  async execute() {
    const expired = await this.prisma.order.findMany({
      where: { paymentStatus: 'PENDING_PAYMENT', expiresAt: { lt: new Date() } },
      include: { items: true },
    });

    for (const order of expired) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          if (!item.variantId) continue;
          const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
          if (!variant || variant.stock === null) continue;
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { reserved: { decrement: item.quantity } },
          });
        }
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'CANCELLED' },
        });
      });
    }

    return { cancelled: expired.length };
  }
}
