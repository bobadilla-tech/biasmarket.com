import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { CreateVariantDto } from './dto/create-variant.dto.js';

@Injectable()
export class ProductsService {
  
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

  private async assertCategoriesInStore(categoryIds: string[], storeId: string) {
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
    const { categoryIds, ...data } = dto;
    if (categoryIds) await this.assertCategoriesInStore(categoryIds, storeId);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: { ...data, storeId, currency: dto.currency ?? store.defaultCurrency },
      });
      if (categoryIds?.length) {
        await tx.productCategory.createMany({
          data: categoryIds.map((categoryId) => ({ productId: product.id, categoryId })),
        });
      }
      return product;
    });
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.product.findMany({
      where: { storeId, deletedAt: null },
      include: { variants: true, categories: { include: { category: true } } },
    });
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
      const product = await tx.product.update({ where: { id: productId }, data });
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
      data: { deletedAt: new Date(), status: 'DRAFT' },
    });
  }

  async addVariant(
    productId: string,
    storeId: string,
    userId: string,
    dto: CreateVariantDto,
  ) {
    await this.findOwnedProduct(productId, storeId, userId);
    return this.prisma.productVariant.create({ data: { ...dto, productId, storeId } });
  }

  async listVariants(productId: string, storeId: string, userId: string) {
    await this.findOwnedProduct(productId, storeId, userId);
    return this.prisma.productVariant.findMany({ where: { productId } });
  }
  
  async addImage(productId: string, storeId: string, userId: string, url: string) {
    const product = await this.findOwnedProduct(productId, storeId, userId);
    return this.prisma.product.update({
      where: { id: productId },
      data: { images: [...product.images, url] },
    });
  }
}
