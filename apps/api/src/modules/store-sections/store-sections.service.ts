import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@biasmarket/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CreateStoreSectionDto,
  StoreSectionTypeDto,
} from './dto/create-store-section.dto.js';
import type { UpdateStoreSectionDto } from './dto/update-store-section.dto.js';
import type { ReorderStoreSectionsDto } from './dto/reorder-store-sections.dto.js';

@Injectable()
export class StoreSectionsService {
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

  private async findOwnedSection(
    sectionId: string,
    storeId: string,
    userId: string,
  ) {
    await this.assertOwnership(storeId, userId);
    const section = await this.prisma.storeSection.findUnique({
      where: { id: sectionId },
    });
    if (!section || section.storeId !== storeId) {
      throw new NotFoundException('Sección no encontrada');
    }
    return section;
  }

  /**
   * Store sections are storefront-visible, so any create/update/delete/reorder
   * moves the sitemap's per-store `lastModified` (D4 of
   * docs/plans/2026-09-07-store-rich-content-and-thin-content-indexing-plan.md).
   * Kept off Prisma `@updatedAt` on purpose — unrelated store edits must not
   * nudge Google to recrawl.
   */
  private async markStoreContentStale(storeId: string) {
    await this.prisma.store.update({
      where: { id: storeId },
      data: { contentStaleAt: new Date() },
    });
  }

  private async assertCollectionInStore(collectionId: string, storeId: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });
    if (!collection || collection.storeId !== storeId) {
      throw new BadRequestException('Colección inválida');
    }
  }

  async create(storeId: string, userId: string, dto: CreateStoreSectionDto) {
    await this.assertOwnership(storeId, userId);
    if (dto.type === StoreSectionTypeDto.COLLECTION) {
      if (!dto.collectionId) {
        throw new BadRequestException(
          'collectionId es requerido para secciones de tipo COLLECTION',
        );
      }
      await this.assertCollectionInStore(dto.collectionId, storeId);
    }
    const position =
      dto.position ??
      (await this.prisma.storeSection.count({ where: { storeId } }));
    const section = await this.prisma.storeSection.create({
      data: {
        storeId,
        type: dto.type,
        collectionId:
          dto.type === StoreSectionTypeDto.COLLECTION ? dto.collectionId : null,
        content: (dto.content ?? {}) as Prisma.InputJsonValue,
        position,
        hidden: dto.hidden ?? false,
      },
    });
    await this.markStoreContentStale(storeId);
    return section;
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.storeSection.findMany({
      where: { storeId },
      orderBy: { position: 'asc' },
    });
  }

  async update(
    sectionId: string,
    storeId: string,
    userId: string,
    dto: UpdateStoreSectionDto,
  ) {
    const existing = await this.findOwnedSection(sectionId, storeId, userId);
    const nextType = dto.type ?? existing.type;
    if (nextType === StoreSectionTypeDto.COLLECTION) {
      const nextCollectionId = dto.collectionId ?? existing.collectionId;
      if (!nextCollectionId) {
        throw new BadRequestException(
          'collectionId es requerido para secciones de tipo COLLECTION',
        );
      }
      await this.assertCollectionInStore(nextCollectionId, storeId);
    }
    const section = await this.prisma.storeSection.update({
      where: { id: sectionId },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.collectionId !== undefined && {
          collectionId: dto.collectionId,
        }),
        ...(dto.content !== undefined && {
          content: dto.content as Prisma.InputJsonValue,
        }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.hidden !== undefined && { hidden: dto.hidden }),
      },
    });
    await this.markStoreContentStale(storeId);
    return section;
  }

  async delete(sectionId: string, storeId: string, userId: string) {
    await this.findOwnedSection(sectionId, storeId, userId);
    const section = await this.prisma.storeSection.delete({
      where: { id: sectionId },
    });
    await this.markStoreContentStale(storeId);
    return section;
  }

  async reorder(storeId: string, userId: string, dto: ReorderStoreSectionsDto) {
    await this.assertOwnership(storeId, userId);

    const owned = await this.prisma.storeSection.findMany({
      where: { id: { in: dto.sectionIds }, storeId },
      select: { id: true },
    });

    if (owned.length !== dto.sectionIds.length) {
      throw new BadRequestException(
        'Una o más secciones no pertenecen a esta store',
      );
    }

    const sections = await this.prisma.$transaction(async (tx) => {
      for (const [position, sectionId] of dto.sectionIds.entries()) {
        const result = await tx.storeSection.updateMany({
          where: { id: sectionId, storeId },
          data: { position },
        });
        if (result.count !== 1) {
          throw new BadRequestException(
            'Una o más secciones no pertenecen a esta store',
          );
        }
      }

      return tx.storeSection.findMany({
        where: { id: { in: dto.sectionIds }, storeId },
        orderBy: { position: 'asc' },
      });
    });
    await this.markStoreContentStale(storeId);
    return sections;
  }
}
