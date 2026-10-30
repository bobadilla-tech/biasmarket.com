import {
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UpdateStoreReferenceDto } from './dto/update-store-reference.dto.js';

const MAX_REFERENCES_PER_STORE = 200;

@Injectable()
export class StoreReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    if (store.ownerId !== userId)
      throw new ForbiddenException('No sos dueño de esta tienda');
  }

  async findAll(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.storeReference.findMany({
      where: { storeId },
      orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(
    storeId: string,
    userId: string,
    input: {
      imageUrl: string;
      takenAt: Date;
      caption?: string;
      width: number;
      height: number;
    },
  ) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${storeId} FOR UPDATE`;
      const count = await tx.storeReference.count({ where: { storeId } });
      if (count >= MAX_REFERENCES_PER_STORE) {
        throw new ConflictException(
          `El límite es ${MAX_REFERENCES_PER_STORE} referencias por tienda`,
        );
      }
      const reference = await tx.storeReference.create({
        data: { ...input, storeId },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          storeId,
          action: 'store_reference.created',
          entityType: 'StoreReference',
          entityId: reference.id,
          metadata: {},
        },
      });
      return reference;
    });
  }

  async update(
    referenceId: string,
    storeId: string,
    userId: string,
    dto: UpdateStoreReferenceDto,
  ) {
    await this.assertOwnership(storeId, userId);
    const existing = await this.prisma.storeReference.findFirst({
      where: { id: referenceId, storeId },
    });
    if (!existing) throw new NotFoundException('Referencia no encontrada');
    return this.prisma.storeReference.update({
      where: { id: referenceId },
      data: {
        ...dto,
        ...(dto.takenAt ? { takenAt: new Date(dto.takenAt) } : {}),
      },
    });
  }

  async delete(referenceId: string, storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    const existing = await this.prisma.storeReference.findFirst({
      where: { id: referenceId, storeId },
    });
    if (!existing) throw new NotFoundException('Referencia no encontrada');
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.storeReference.delete({
        where: { id: referenceId },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          storeId,
          action: 'store_reference.deleted',
          entityType: 'StoreReference',
          entityId: referenceId,
          metadata: {},
        },
      });
      return deleted;
    });
  }

  async setHidden(referenceId: string, userId: string, hidden: boolean) {
    const existing = await this.prisma.storeReference.findUnique({
      where: { id: referenceId },
    });
    if (!existing) throw new NotFoundException('Referencia no encontrada');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.storeReference.update({
        where: { id: referenceId },
        data: { hidden },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          storeId: existing.storeId,
          action: 'store_reference.hidden',
          entityType: 'StoreReference',
          entityId: referenceId,
          metadata: { hidden },
        },
      });
      return updated;
    });
  }

  async findPublic(
    slug: string,
    order: 'recientes' | 'antiguas',
    page: number,
    limit: number,
  ) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    const where = { storeId: store.id, hidden: false };
    const [items, total] = await Promise.all([
      this.prisma.storeReference.findMany({
        where,
        orderBy: [
          { takenAt: order === 'antiguas' ? 'asc' : 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.storeReference.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}
