import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import type { CreateVariantDto } from './dto/create-variant.dto.js';
import type { UpdateVariantDto } from './dto/update-variant.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private computeAvailableStock(
    variants: { stock: number | null; reserved: number }[],
  ) {
    const hasUnlimited = variants.some((v) => v.stock === null);
    if (hasUnlimited) return null;
    if (variants.length === 0) return null;
    return variants.reduce((sum, v) => sum + (v.stock ?? 0) - v.reserved, 0);
  }

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

  private async findOwnedProduct(
    productId: string,
    storeId: string,
    userId: string,
  ) {
    await this.assertOwnership(storeId, userId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.storeId !== storeId) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  /**
   * Recompute `Store.publishedProductCount` from scratch and stamp
   * `contentStaleAt`. Called from every mutation that can change whether a
   * product counts as PUBLISHED / non-discontinued / non-soft-deleted (D4 of
   * docs/plans/2026-09-07-store-rich-content-and-thin-content-indexing-plan.md).
   * A full recount (rather than scattered increment/decrement math) keeps the
   * "what counts" rule in one place; the D4 backfill migration mirrors it.
   */
  private async recountPublishedProducts(storeId: string) {
    const publishedProductCount = await this.prisma.product.count({
      where: {
        storeId,
        status: 'PUBLISHED',
        discontinued: false,
        deletedAt: null,
      },
    });
    await this.prisma.store.update({
      where: { id: storeId },
      data: { publishedProductCount, contentStaleAt: new Date() },
    });
  }

  private async assertCategoriesInStore(
    categoryIds: string[],
    storeId: string,
  ) {
    if (categoryIds.length === 0) return;
    const count = await this.prisma.category.count({
      where: { id: { in: categoryIds }, storeId },
    });
    if (count !== categoryIds.length) {
      throw new BadRequestException('Categoría inválida');
    }
  }

  // A newly created product is always DRAFT (CreateProductDto has no `status`
  // and the global ValidationPipe rejects unknown fields), so it never affects
  // `publishedProductCount` — recount happens on publish(), not here.
  async create(storeId: string, userId: string, dto: CreateProductDto) {
    const store = await this.assertOwnership(storeId, userId);
    const { categoryIds, stock, variants, ...data } = dto;
    if (categoryIds) await this.assertCategoriesInStore(categoryIds, storeId);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          ...data,
          storeId,
          currency: dto.currency ?? store.defaultCurrency,
        },
      });
      if (variants?.length) {
        await Promise.all(
          variants.map((variant) =>
            tx.productVariant.create({
              data: {
                ...variant,
                attributes: variant.attributes ?? {},
                productId: product.id,
                storeId,
              },
            }),
          ),
        );
      } else if (stock !== undefined) {
        await tx.productVariant.create({
          data: {
            productId: product.id,
            storeId,
            name: 'Default',
            stock,
          },
        });
      }
      if (categoryIds?.length) {
        await tx.productCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            productId: product.id,
            categoryId,
          })),
        });
      }
      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: { variants: true },
      });
    });
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    const products = await this.prisma.product.findMany({
      where: { storeId, deletedAt: null },
      include: { variants: true, categories: { include: { category: true } } },
    });

    if (products.length === 0) return [];

    const sold = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { storeId, productId: { in: products.map((p) => p.id) } },
      _sum: { quantity: true },
    });

    const soldByProductId = Object.fromEntries(
      sold.map((row) => [row.productId, row._sum.quantity ?? 0]),
    );

    return products.map((product) => {
      const variants = product.variants;
      const availableStock = this.computeAvailableStock(variants);

      return {
        ...product,
        soldUnits: soldByProductId[product.id] ?? 0,
        availableStock,
      };
    });
  }

  async findOne(storeId: string, productId: string, userId: string) {
    await this.assertOwnership(storeId, userId);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true, categories: { include: { category: true } } },
    });

    if (!product || product.storeId !== storeId || product.deletedAt) {
      throw new NotFoundException('Producto no encontrado');
    }

    const sold = await this.prisma.orderItem.aggregate({
      where: { storeId, productId },
      _sum: { quantity: true },
    });

    const availableStock = this.computeAvailableStock(product.variants);

    return {
      ...product,
      soldUnits: sold._sum.quantity ?? 0,
      availableStock,
    };
  }

  async publish(productId: string, storeId: string, userId: string) {
    await this.findOwnedProduct(productId, storeId, userId);
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { status: 'PUBLISHED' },
    });
    await this.recountPublishedProducts(storeId);
    return product;
  }

  async update(
    productId: string,
    storeId: string,
    userId: string,
    dto: UpdateProductDto,
  ) {
    await this.findOwnedProduct(productId, storeId, userId);
    const { categoryIds, ...data } = dto;
    if (categoryIds) await this.assertCategoriesInStore(categoryIds, storeId);
    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        data,
      });
      if (categoryIds) {
        await tx.productCategory.deleteMany({ where: { productId } });
        if (categoryIds.length) {
          await tx.productCategory.createMany({
            data: categoryIds.map((categoryId) => ({ productId, categoryId })),
          });
        }
      }
      return updated;
    });
    // `discontinued` is the only count-affecting field UpdateProductDto exposes
    // (publish/soft-delete are their own endpoints); recount only when it moved.
    if ('discontinued' in data) {
      await this.recountPublishedProducts(storeId);
    }
    return product;
  }

  async softDelete(productId: string, storeId: string, userId: string) {
    await this.findOwnedProduct(productId, storeId, userId);
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), status: 'DRAFT', discontinued: false },
    });
    await this.recountPublishedProducts(storeId);
    return product;
  }

  async addVariant(
    productId: string,
    storeId: string,
    userId: string,
    dto: CreateVariantDto,
  ) {
    await this.findOwnedProduct(productId, storeId, userId);
    return this.prisma.productVariant.create({
      data: { ...dto, productId, storeId },
    });
  }

  async listVariants(productId: string, storeId: string, userId: string) {
    await this.findOwnedProduct(productId, storeId, userId);
    return this.prisma.productVariant.findMany({ where: { productId } });
  }

  async updateVariant(
    productId: string,
    variantId: string,
    storeId: string,
    userId: string,
    dto: UpdateVariantDto,
  ) {
    const product = await this.findOwnedProduct(productId, storeId, userId);
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (
      !variant ||
      variant.productId !== productId ||
      variant.storeId !== storeId
    ) {
      throw new NotFoundException('Variante no encontrada');
    }
    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { ...dto },
    });
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (store) {
      await this.notifications.syncStockAlerts(
        this.prisma,
        store,
        product,
        updated,
      );
    }
    return updated;
  }

  async deleteVariant(
    productId: string,
    variantId: string,
    storeId: string,
    userId: string,
  ) {
    await this.findOwnedProduct(productId, storeId, userId);
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (
      !variant ||
      variant.productId !== productId ||
      variant.storeId !== storeId
    ) {
      throw new NotFoundException('Variante no encontrada');
    }
    const usedCount = await this.prisma.orderItem.count({
      where: { variantId },
    });
    if (usedCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar una variante con ventas',
      );
    }
    return this.prisma.productVariant.delete({ where: { id: variantId } });
  }

  private static readonly MAX_IMAGES = 6;

  async addImage(
    productId: string,
    storeId: string,
    userId: string,
    url: string,
    replace?: boolean,
  ) {
    const product = await this.findOwnedProduct(productId, storeId, userId);
    if (!replace && product.images.length >= ProductsService.MAX_IMAGES) {
      throw new BadRequestException(
        `Máximo ${ProductsService.MAX_IMAGES} imágenes por producto`,
      );
    }
    const images = replace
      ? product.images.length
        ? [url, ...product.images.slice(1)]
        : [url]
      : [...product.images, url];
    return this.prisma.product.update({
      where: { id: productId },
      data: { images },
    });
  }

  async removeImage(
    productId: string,
    storeId: string,
    userId: string,
    index: number,
  ) {
    const product = await this.findOwnedProduct(productId, storeId, userId);
    if (index < 0 || index >= product.images.length) {
      throw new BadRequestException('Índice de imagen inválido');
    }
    const removed = product.images[index];
    const images = product.images.filter((_, i) => i !== index);
    await this.prisma.product.update({
      where: { id: productId },
      data: { images },
    });
    return { removed };
  }

  async reorderImages(
    productId: string,
    storeId: string,
    userId: string,
    images: string[],
  ) {
    const product = await this.findOwnedProduct(productId, storeId, userId);
    if (images.length !== product.images.length) {
      throw new BadRequestException(
        `Se esperaban ${product.images.length} imágenes`,
      );
    }
    const currentSet = new Set(product.images);
    const dedup = new Set(images);
    if (
      dedup.size !== images.length ||
      !images.every((url) => currentSet.has(url))
    ) {
      throw new BadRequestException('URLs de imagen inválidas');
    }
    return this.prisma.product.update({
      where: { id: productId },
      data: { images },
    });
  }

  async clearImages(productId: string, storeId: string, userId: string) {
    const product = await this.findOwnedProduct(productId, storeId, userId);
    const urls = product.images;
    await this.prisma.product.update({
      where: { id: productId },
      data: { images: [] },
    });
    return { removed: urls };
  }

  async addVariantImage(
    variantId: string,
    productId: string,
    storeId: string,
    userId: string,
    url: string,
  ) {
    await this.findOwnedProduct(productId, storeId, userId);
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (
      !variant ||
      variant.productId !== productId ||
      variant.storeId !== storeId
    ) {
      throw new NotFoundException('Variante no encontrada');
    }
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: { imageOverride: url },
    });
  }
}
