import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { slugify } from "@biasmarket/utils/strings";
import type { CreateCategoryDto } from "./dto/create-category.dto.js";
import type { UpdateCategoryDto } from "./dto/update-category.dto.js";

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private async uniqueSlug(storeId: string, name: string) {
    const base = slugify(name) || "categoria";
    const siblings = await this.prisma.category.findMany({
      where: { storeId, slug: { startsWith: base } },
      select: { slug: true },
    });
    const used = new Set(siblings.map(({ slug }) => slug));
    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No sos dueño de esta store");
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
      throw new NotFoundException("Categoría no encontrada");
    }
    return category;
  }

  private async assertParentInStore(parentId: string, storeId: string) {
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.storeId !== storeId) {
      throw new BadRequestException("Categoría padre inválida");
    }
  }

  async create(storeId: string, userId: string, dto: CreateCategoryDto) {
    await this.assertOwnership(storeId, userId);
    if (dto.parentId) {
      await this.assertParentInStore(dto.parentId, storeId);
    }
    const slug = await this.uniqueSlug(storeId, dto.name);
    return this.prisma.category.create({
      data: { name: dto.name, parentId: dto.parentId, storeId, slug },
    });
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.category.findMany({
      where: { storeId },
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    });
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
        throw new BadRequestException(
          "Una categoría no puede ser su propio padre",
        );
      }
      await this.assertParentInStore(dto.parentId, storeId);
    }
    if (dto.slug) {
      const existing = await this.prisma.category.findFirst({
        where: { storeId, slug: dto.slug, NOT: { id: categoryId } },
        select: { id: true },
      });
      if (existing) throw new ConflictException("El slug ya está en uso");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const category = await tx.category.update({
          where: { id: categoryId },
          data: dto,
          include: { _count: { select: { products: true } } },
        });
        await tx.store.update({
          where: { id: storeId },
          data: { contentStaleAt: new Date() },
        });
        return category;
      });
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("El slug ya está en uso");
      }
      throw error;
    }
  }

  async updateImage(
    categoryId: string,
    storeId: string,
    userId: string,
    imageUrl: string | null,
  ) {
    await this.findOwnedCategory(categoryId, storeId, userId);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.update({
        where: { id: categoryId },
        data: { imageUrl },
        include: { _count: { select: { products: true } } },
      });
      await tx.store.update({
        where: { id: storeId },
        data: { contentStaleAt: new Date() },
      });
      return category;
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
        "No se puede eliminar: la categoría tiene subcategorías o productos asociados",
      );
    }
    return this.prisma.category.delete({ where: { id: categoryId } });
  }
}
