import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { slugify } from '@biasmarket/utils/strings';
import { CreateCollectionDto } from './dto/create-collection.dto.js';
import { UpdateCollectionDto } from './dto/update-collection.dto.js';
import { AddCollectionProductDto } from './dto/add-collection-product.dto.js';
import { ReorderCollectionProductsDto } from './dto/reorder-collection-products.dto.js';

@Injectable()
export class CollectionsService {
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

  private async findOwnedCollection(
    collectionId: string,
    storeId: string,
    userId: string,
  ) {
    await this.assertOwnership(storeId, userId);
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });
    if (!collection || collection.storeId !== storeId) {
      throw new NotFoundException('Colección no encontrada');
    }
    return collection;
  }

  private async findOwnedProduct(productId: string, storeId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.storeId !== storeId) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  async create(storeId: string, userId: string, dto: CreateCollectionDto) {
    await this.assertOwnership(storeId, userId);
    const slug = slugify(dto.name);
    const existing = await this.prisma.collection.findUnique({
      where: { storeId_slug: { storeId, slug } },
    });
    if (existing) {
      throw new ConflictException('Ya existe una colección con ese nombre');
    }
    return this.prisma.collection.create({
      data: { name: dto.name, description: dto.description ?? '', slug, storeId },
    });
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.collection.findMany({
      where: { storeId },
      include: { products: { orderBy: { position: 'asc' }, include: { product: true } } },
    });
  }

  async update(
    collectionId: string,
    storeId: string,
    userId: string,
    dto: UpdateCollectionDto,
  ) {
    await this.findOwnedCollection(collectionId, storeId, userId);
    return this.prisma.collection.update({
      where: { id: collectionId },
      data: dto,
    });
  }

  async delete(collectionId: string, storeId: string, userId: string) {
    await this.findOwnedCollection(collectionId, storeId, userId);
    return this.prisma.collection.delete({ where: { id: collectionId } });
  }

  async addProduct(
    collectionId: string,
    storeId: string,
    userId: string,
    dto: AddCollectionProductDto,
  ) {
    await this.findOwnedCollection(collectionId, storeId, userId);
    await this.findOwnedProduct(dto.productId, storeId);
    const position =
      dto.position ??
      (await this.prisma.collectionProduct.count({ where: { collectionId } }));
    return this.prisma.collectionProduct.upsert({
      where: { collectionId_productId: { collectionId, productId: dto.productId } },
      create: { collectionId, productId: dto.productId, position },
      update: { position },
    });
  }

  async removeProduct(
    collectionId: string,
    storeId: string,
    userId: string,
    productId: string,
  ) {
    await this.findOwnedCollection(collectionId, storeId, userId);
    return this.prisma.collectionProduct.delete({
      where: { collectionId_productId: { collectionId, productId } },
    });
  }

  async reorderProducts(
    collectionId: string,
    storeId: string,
    userId: string,
    dto: ReorderCollectionProductsDto,
  ) {
    await this.findOwnedCollection(collectionId, storeId, userId);
    return this.prisma.$transaction(
      dto.productIds.map((productId, position) =>
        this.prisma.collectionProduct.update({
          where: { collectionId_productId: { collectionId, productId } },
          data: { position },
        }),
      ),
    );
  }
}
