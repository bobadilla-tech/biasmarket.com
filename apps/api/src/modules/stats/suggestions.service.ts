import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  lowStockRule,
  noRecentOrdersRule,
  staleOrdersRule,
  topSellerRule,
} from './suggestion-rules.js';
import type { Suggestion } from './suggestions.types.js';

const RECENT_ORDERS_WINDOW_DAYS = 7;

@Injectable()
export class SuggestionsService {
  constructor(private prisma: PrismaService) {}

  private async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return store;
  }

  async getSuggestions(storeId: string, userId: string): Promise<Suggestion[]> {
    const store = await this.assertOwnership(storeId, userId);

    const staleCutoff = new Date(
      Date.now() - store.holdWindowHours * 60 * 60 * 1000,
    );
    const recentCutoff = new Date(
      Date.now() - RECENT_ORDERS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [lowStockCount, staleOrderCount, recentOrderCount, topProductRows] =
      await Promise.all([
        this.prisma.notification.count({
          where: {
            storeId,
            archived: false,
            type: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] },
          },
        }),
        this.prisma.order.count({
          where: {
            storeId,
            paymentStatus: { in: ['PENDING_PAYMENT', 'PARTIALLY_PAID'] },
            createdAt: { lte: staleCutoff },
          },
        }),
        this.prisma.order.count({
          where: { storeId, createdAt: { gte: recentCutoff } },
        }),
        this.prisma.orderItem.groupBy({
          by: ['productId'],
          where: { storeId },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 1,
        }),
      ]);

    let topProductName: string | null = null;
    let topProductUnitsSold = 0;
    if (topProductRows.length > 0) {
      const product = await this.prisma.product.findUnique({
        where: { id: topProductRows[0].productId },
        select: { name: true },
      });
      topProductName = product?.name ?? null;
      topProductUnitsSold = topProductRows[0]._sum.quantity ?? 0;
    }

    const suggestions = [
      lowStockRule(lowStockCount),
      staleOrdersRule(staleOrderCount, store.holdWindowHours),
      noRecentOrdersRule(recentOrderCount, RECENT_ORDERS_WINDOW_DAYS),
      topSellerRule(topProductName, topProductUnitsSold),
    ];

    return suggestions.filter((s): s is Suggestion => s !== null);
  }
}
