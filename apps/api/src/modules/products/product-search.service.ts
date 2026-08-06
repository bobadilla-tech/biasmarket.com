import { Injectable } from "@nestjs/common";
import type { Prisma } from "@biasmarket/db";
import type { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class ProductSearchService {
  constructor(private prisma: PrismaService) {}

  async search(page: number, limit: number, q: string | undefined) {
    const where: Prisma.ProductWhereInput = {
      status: "PUBLISHED",
      deletedAt: null,
      store: { owner: { banned: { not: true } } },
      ...(q && { name: { contains: q, mode: "insensitive" as const } }),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          price: true,
          currency: true,
          images: true,
          store: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { products, total, page, limit };
  }
}
