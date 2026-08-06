import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@biasmarket/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { slugify } from "@biasmarket/utils/strings";
import type { UpdateStoreDto } from "./dto/update-store.dto.js";
import type { CreateStoreDto } from "./dto/create-store.dto.js";

const RESERVED_SLUGS = ["www", "api", "admin", "app"];

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateStoreDto) {
    const slug = slugify(dto.slug);

    if (RESERVED_SLUGS.includes(slug)) {
      throw new BadRequestException("This slug is reserved");
    }

    const existing = await this.prisma.store.findUnique({ where: { slug } });

    if (existing) {
      throw new BadRequestException("This slug is not avaible");
    }

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: dto.name,
          slug,
          ownerId,
          themeConfig: (dto.themeConfig ?? {}) as Prisma.InputJsonValue,
          paymentInstructions: "",
          whatsappNumber: dto.whatsappNumber,
          ...(dto.defaultCurrency && { defaultCurrency: dto.defaultCurrency }),
        },
      });
      await tx.deliveryMethodConfig.create({
        data: { storeId: store.id, type: "PICKUP", enabled: true, details: {} },
      });
      await tx.paymentMethodConfig.createMany({
        data: (["YAPE", "PLIN", "TRANSFER", "CASH"] as const).map((method) => ({
          storeId: store.id,
          method,
          enabled: true,
          details: {},
        })),
      });
      return store;
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.store.findMany({ where: { ownerId: userId } });
  }

  // Platform-admin view — deliberately unfiltered by ownership, same
  // documented exception as ContactInquiry (see docs/core/admin.md).
  async findAllForAdmin() {
    return this.prisma.store.findMany({
      include: { owner: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(storeId: string, userId: string, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No sos dueño de esta store");
    }
    const { themeConfig, ...rest } = dto;
    return this.prisma.store.update({
      where: { id: storeId },
      data: {
        ...rest,
        ...(themeConfig !== undefined && {
          themeConfig: themeConfig as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async delete(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No eres dueño de esta store");
    }
    try {
      return await this.prisma.store.delete({ where: { id: storeId } });
    } catch {
      throw new BadRequestException(
        "No se puede eliminar: la tienda tiene productos u órdenes asociadas",
      );
    }
  }

  async findBySlugForOwner(slug: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No sos dueño de esta store");
    }
    return store;
  }

  async findAllPublic() {
    return this.prisma.store.findMany({
      select: { slug: true, createdAt: true },
    });
  }

  // v1 ranking: minimum order-count floor (>=3 VERIFIED orders in the
  // trailing 30-day window) before ranking by revenue within that eligible
  // set, tie-broken by order count — plain revenue-only ranking would let a
  // single large sale outrank many smaller repeat-sale stores with no
  // tie-break. Computed at request time, same as every other aggregate in
  // this batch — revisit with a rollup table only if this becomes a real
  // load concern.
  async findFeatured(limit: number) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const MIN_ORDER_COUNT = 3;

    const candidates = await this.prisma.store.findMany({
      where: {
        products: { some: { status: "PUBLISHED", deletedAt: null } },
        owner: { banned: { not: true } },
      },
      select: { id: true, name: true, slug: true, logoUrl: true },
    });
    if (candidates.length === 0) return [];

    const orders = await this.prisma.order.findMany({
      where: {
        storeId: { in: candidates.map((c) => c.id) },
        paymentStatus: "VERIFIED",
        createdAt: { gte: since },
      },
      select: { storeId: true, payments: { select: { amount: true } } },
    });

    const revenueByStore = new Map<string, number>();
    const orderCountByStore = new Map<string, number>();
    for (const order of orders) {
      const revenue = order.payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );
      revenueByStore.set(
        order.storeId,
        (revenueByStore.get(order.storeId) ?? 0) + revenue,
      );
      orderCountByStore.set(
        order.storeId,
        (orderCountByStore.get(order.storeId) ?? 0) + 1,
      );
    }

    return candidates
      .map((store) => ({
        ...store,
        revenue: revenueByStore.get(store.id) ?? 0,
        orderCount: orderCountByStore.get(store.id) ?? 0,
      }))
      .filter((store) => store.orderCount >= MIN_ORDER_COUNT)
      .sort((a, b) => b.revenue - a.revenue || b.orderCount - a.orderCount)
      .slice(0, limit);
  }

  async findDirectory(page: number, limit: number, q: string | undefined) {
    const where: Prisma.StoreWhereInput = {
      products: { some: { status: "PUBLISHED", deletedAt: null } },
      owner: { banned: { not: true } },
      ...(q && { name: { contains: q, mode: "insensitive" as const } }),
    };

    const [stores, total] = await Promise.all([
      this.prisma.store.findMany({
        where,
        select: { id: true, name: true, slug: true, logoUrl: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.store.count({ where }),
    ]);

    return { stores, total, page, limit };
  }

  async findPublicBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException("Tienda no encontrada");

    const rawSections = await this.prisma.storeSection.findMany({
      where: { storeId: store.id },
      orderBy: { position: "asc" },
      include: {
        collection: {
          include: {
            products: {
              orderBy: { position: "asc" },
              include: { product: { include: { variants: true } } },
            },
          },
        },
      },
    });

    // Filter out unpublished/deleted products after the fetch — Prisma
    // relation-filter-in-include semantics for nested to-many-through-join
    // reads are easy to get subtly wrong, application-level filtering isn't.
    const sections = rawSections.map((section) => ({
      ...section,
      collection: section.collection && {
        ...section.collection,
        products: section.collection.products.filter(
          (cp) =>
            cp.product.status === "PUBLISHED" && cp.product.deletedAt === null,
        ),
      },
    }));

    // A product only shows up if it's attached to a collection wired into
    // one of the sections above — that's a manual curation step, separate
    // from creating/publishing a product. Any published product a seller
    // never got around to adding to a collection would otherwise be
    // invisible forever, so always append a catch-all trailing section for
    // whatever's left over (this also replaces the old "zero sections"
    // fallback — that's just the case where every product is left over).
    const coveredProductIds = sections.flatMap(
      (section) => section.collection?.products.map((cp) => cp.productId) ?? [],
    );
    const orphanProducts = await this.prisma.product.findMany({
      where: {
        storeId: store.id,
        status: "PUBLISHED",
        deletedAt: null,
        id: { notIn: coveredProductIds },
      },
      include: { variants: true },
    });

    if (orphanProducts.length > 0) {
      sections.push({
        id: "default",
        storeId: store.id,
        type: "COLLECTION" as const,
        collectionId: null,
        content: {},
        position: sections.length,
        createdAt: new Date(),
        collection: {
          id: null as unknown as string,
          storeId: store.id,
          name: "",
          slug: "",
          description: "",
          createdAt: new Date(),
          products: orphanProducts.map((product, position) => ({
            collectionId: null as unknown as string,
            productId: product.id,
            position,
            product,
          })),
        },
      });
    }

    return { ...store, sections };
  }

  async findCollectionsPublic() {
    const collections = await this.prisma.collection.findMany({
      include: {
        store: { select: { slug: true } },
        products: {
          include: { product: { select: { status: true, deletedAt: true } } },
        },
      },
    });
    return collections
      .filter((c) =>
        c.products.some(
          (cp) =>
            cp.product.status === "PUBLISHED" && cp.product.deletedAt === null,
        )
      )
      .map((c) => ({
        storeSlug: c.store.slug,
        collectionSlug: c.slug,
        createdAt: c.createdAt,
      }));
  }

  async findCategoriesPublic(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException("Tienda no encontrada");
    return this.prisma.category.findMany({
      where: { storeId: store.id },
      select: { id: true, name: true, parentId: true },
    });
  }

  async findPublicProduct(slug: string, productId: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException("Tienda no encontrada");

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true },
    });
    if (
      !product ||
      product.storeId !== store.id ||
      product.status !== "PUBLISHED" ||
      product.deletedAt !== null
    ) {
      throw new NotFoundException("Producto no encontrado");
    }

    return {
      store: { name: store.name, slug: store.slug, logoUrl: store.logoUrl },
      product,
    };
  }

  async updateLogo(storeId: string, userId: string, url: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No eres dueño de esta store");
    }
    return this.prisma.store.update({
      where: { id: storeId },
      data: { logoUrl: url },
    });
  }
}
