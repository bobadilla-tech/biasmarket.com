import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';

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

  async create(storeId: string, userId: string, dto: CreateProductDto) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.product.create({ data: { ...dto, storeId } });
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.product.findMany({
      where: { storeId, deletedAt: null },
      include: { variants: true },
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
    return this.prisma.product.update({ where: { id: productId }, data: dto });
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
    return this.prisma.productVariant.create({ data: { ...dto, productId } });
  }

  async listVariants(productId: string, storeId: string, userId: string) {
    await this.findOwnedProduct(productId, storeId, userId);
    return this.prisma.productVariant.findMany({ where: { productId } });
  }
}
