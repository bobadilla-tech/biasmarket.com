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
    return this.prisma.product.update({
      where: { id: productId },
      data: { status: 'PUBLISHED' },
    });
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
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
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
      return product;
    });
  }

  async softDelete(productId: string, storeId: string, userId: string) {
    await this.findOwnedProduct(productId, storeId, userId);
    return this.prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), status: 'DRAFT', discontinued: false },
    });
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
    if (images.length > ProductsService.MAX_IMAGES) {
      throw new BadRequestException(
        `Máximo ${ProductsService.MAX_IMAGES} imágenes por producto`,
      );
    }
    const currentSet = new Set(product.images);
    if (!images.every((url) => currentSet.has(url))) {
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
