import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoriesService {
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

  private async findOwnedCategory(
    categoryId: string,
    storeId: string,
    userId: string,
  ) {
    await this.assertOwnership(storeId, userId);
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.storeId !== storeId) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return category;
  }

  private async assertParentInStore(
    parentId: string,
    storeId: string,
  ) {
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.storeId !== storeId) {
      throw new BadRequestException('Categoría padre inválida');
    }
  }

  async create(storeId: string, userId: string, dto: CreateCategoryDto) {
    await this.assertOwnership(storeId, userId);
    if (dto.parentId) {
      await this.assertParentInStore(dto.parentId, storeId);
    }
    return this.prisma.category.create({
      data: { name: dto.name, parentId: dto.parentId, storeId },
    });
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.category.findMany({ where: { storeId } });
  }

  async update(
    categoryId: string,
    storeId: string,
    userId: string,
    dto: UpdateCategoryDto,
  ) {
    await this.findOwnedCategory(categoryId, storeId, userId);
    if (dto.parentId) {
      if (dto.parentId === categoryId) {
        throw new BadRequestException('Una categoría no puede ser su propio padre');
      }
      await this.assertParentInStore(dto.parentId, storeId);
    }
    return this.prisma.category.update({
      where: { id: categoryId },
      data: dto,
    });
  }

  async delete(categoryId: string, storeId: string, userId: string) {
    await this.findOwnedCategory(categoryId, storeId, userId);
    const [childCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: categoryId } }),
      this.prisma.productCategory.count({ where: { categoryId } }),
    ]);
    if (childCount > 0 || productCount > 0) {
      throw new ConflictException(
        'No se puede eliminar: la categoría tiene subcategorías o productos asociados',
      );
    }
    return this.prisma.category.delete({ where: { id: categoryId } });
  }
}
