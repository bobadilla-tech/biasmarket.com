import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Prisma } from '@biasmarket/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateStoreSectionDto, StoreSectionTypeDto } from './dto/create-store-section.dto.js';
import { UpdateStoreSectionDto } from './dto/update-store-section.dto.js';
import { ReorderStoreSectionsDto } from './dto/reorder-store-sections.dto.js';

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
        throw new BadRequestException('collectionId es requerido para secciones de tipo COLLECTION');
      }
      await this.assertCollectionInStore(dto.collectionId, storeId);
    }
    const position =
      dto.position ?? (await this.prisma.storeSection.count({ where: { storeId } }));
    return this.prisma.storeSection.create({
      data: {
        storeId,
        type: dto.type,
        collectionId: dto.type === StoreSectionTypeDto.COLLECTION ? dto.collectionId : null,
        content: (dto.content ?? {}) as Prisma.InputJsonValue,
        position,
      },
    });
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
        throw new BadRequestException('collectionId es requerido para secciones de tipo COLLECTION');
      }
      await this.assertCollectionInStore(nextCollectionId, storeId);
    }
    return this.prisma.storeSection.update({
      where: { id: sectionId },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.collectionId !== undefined && { collectionId: dto.collectionId }),
        ...(dto.content !== undefined && { content: dto.content as Prisma.InputJsonValue }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
    });
  }

  async delete(sectionId: string, storeId: string, userId: string) {
    await this.findOwnedSection(sectionId, storeId, userId);
    return this.prisma.storeSection.delete({ where: { id: sectionId } });
  }

  async reorder(storeId: string, userId: string, dto: ReorderStoreSectionsDto) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.$transaction(
      dto.sectionIds.map((sectionId, position) =>
        this.prisma.storeSection.update({
          where: { id: sectionId },
          data: { position },
        }),
      ),
    );
  }
}
