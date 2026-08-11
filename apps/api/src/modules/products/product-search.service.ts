import { Injectable } from '@nestjs/common';
import type { Prisma } from '@biasmarket/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ProductSort } from '../../common/public-list-query.js';

const PRODUCT_SELECT = {
  id: true,
  name: true,
  price: true,
  currency: true,
  images: true,
  store: { select: { name: true, slug: true } },
} as const;

@Injectable()
export class ProductSearchService {
  constructor(private prisma: PrismaService) {}

  async search(
    page: number,
    limit: number,
    q: string | undefined,
    category: string | undefined,
    sort: ProductSort = 'latest',
  ) {
    const where: Prisma.ProductWhereInput = {
      status: 'PUBLISHED',
      deletedAt: null,
      discontinued: false,
      store: { owner: { banned: { not: true } } },
      ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
      ...(category && {
        categories: {
          some: {
            category: {
              name: { equals: category, mode: 'insensitive' as const },
            },
          },
        },
      }),
    };

    const total = await this.prisma.product.count({ where });

    const products = await (sort === 'bestseller'
      ? this.findBestsellers(page, limit, where)
      : this.prisma.product.findMany({
          where,
          select: PRODUCT_SELECT,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }));

    return { products, total, page, limit };
  }

  private async findBestsellers(
    page: number,
    limit: number,
    where: Prisma.ProductWhereInput,
  ) {
    // Rank on the database instead of loading every product and sorting in
    // memory. Restrict the sales aggregation to the eligible product ids (the
    // same `where` used for the total count), then fetch only the ids that
    // made this page's ranking.
    const eligibleIds = (
      await this.prisma.product.findMany({ where, select: { id: true } })
    ).map((row) => row.id);

    if (eligibleIds.length === 0) return [];

    const rows = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { in: eligibleIds },
        order: { paymentStatus: 'VERIFIED' },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      skip: (page - 1) * limit,
      take: limit,
    });

    if (rows.length === 0) return [];

    const topIds = rows.map((row) => row.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: topIds } },
      select: PRODUCT_SELECT,
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    return topIds.flatMap((id) => {
      const product = byId.get(id);
      return product ? [product] : [];
    });
  }
}
