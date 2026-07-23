import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { slugify } from '@biasmarket/utils/strings';
import { UpdateStoreDto } from './dto/update-store.dto.js';
import { CreateStoreDto } from './dto/create-store.dto.js';

const RESERVED_SLUGS = ['www', 'api', 'admin', 'app'];

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) { }

  async create(ownerId: string, dto: CreateStoreDto) {
    const slug = slugify(dto.slug);

    if (RESERVED_SLUGS.includes(slug)) {
      throw new BadRequestException('This slug is reserved');
    }

    const existing = await this.prisma.store.findUnique({ where: { slug } });

    if (existing) {
      throw new BadRequestException('This slug is not avaible');
    }

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: dto.name,
          slug,
          ownerId,
          themeConfig: {},
          paymentInstructions: '',
          whatsappNumber: dto.whatsappNumber,
          ...(dto.defaultCurrency && { defaultCurrency: dto.defaultCurrency }),
        },
      });
      await tx.deliveryMethodConfig.create({
        data: { storeId: store.id, type: 'PICKUP', enabled: true, details: {} },
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
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(storeId: string, userId: string, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return this.prisma.store.update({ where: { id: storeId }, data: dto });
  }

  async delete(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No eres dueño de esta store');
    }
    try {
      return await this.prisma.store.delete({ where: { id: storeId } });
    } catch {
      throw new BadRequestException(
        'No se puede eliminar: la tienda tiene productos u órdenes asociadas',
      );
    }
  }

  async findBySlugForOwner(slug: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return store;
  }

  async findAllPublic() {
    return this.prisma.store.findMany({
      select: { slug: true, createdAt: true },
    });
  }

  async findPublicBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Tienda no encontrada');

    const rawSections = await this.prisma.storeSection.findMany({
      where: { storeId: store.id },
      orderBy: { position: 'asc' },
      include: {
        collection: {
          include: {
            products: {
              orderBy: { position: 'asc' },
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
          (cp) => cp.product.status === 'PUBLISHED' && cp.product.deletedAt === null,
        ),
      },
    }));

    if (sections.length > 0) {
      return { ...store, sections };
    }

    // No sections configured yet — fall back to a single implicit
    // "all published products" section so existing/new stores don't render blank.
    const products = await this.prisma.product.findMany({
      where: { storeId: store.id, status: 'PUBLISHED', deletedAt: null },
      include: { variants: true },
    });
    return {
      ...store,
      sections: [
        {
          id: 'default',
          type: 'COLLECTION' as const,
          collectionId: null,
          content: {},
          position: 0,
          collection: {
            id: null,
            name: '',
            slug: '',
            description: '',
            products: products.map((product, position) => ({
              collectionId: null,
              productId: product.id,
              position,
              product,
            })),
          },
        },
      ],
    };
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
          (cp) => cp.product.status === 'PUBLISHED' && cp.product.deletedAt === null,
        ),
      )
      .map((c) => ({
        storeSlug: c.store.slug,
        collectionSlug: c.slug,
        createdAt: c.createdAt,
      }));
  }

  async findCategoriesPublic(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return this.prisma.category.findMany({
      where: { storeId: store.id },
      select: { id: true, name: true, parentId: true },
    });
  }

  async updateLogo(storeId: string, userId: string, url: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No eres dueño de esta store');
    }
    return this.prisma.store.update({ where: { id: storeId }, data: { logoUrl: url } });
  }
}
