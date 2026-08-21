import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@biasmarket/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateCourierDto } from './dto/create-courier.dto.js';
import type { UpdateCourierDto } from './dto/update-courier.dto.js';

@Injectable()
export class CouriersService {
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

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.courier.findMany({
      where: { storeId },
      orderBy: { sortOrder: 'asc' },
      include: { configs: { orderBy: { modality: 'asc' } } },
    });
  }

  async create(storeId: string, userId: string, dto: CreateCourierDto) {
    await this.assertOwnership(storeId, userId);

    // Prevent duplicate modalities in the input
    const modalities = dto.modalities.map((m) => m.modality);
    if (new Set(modalities).size !== modalities.length) {
      throw new BadRequestException(
        'No se pueden repetir modalidades en un mismo courier',
      );
    }

    return this.prisma.courier.create({
      data: {
        storeId,
        name: dto.name,
        enabled: dto.enabled ?? true,
        sortOrder: dto.sortOrder ?? 0,
        configs: {
          create: dto.modalities.map((m) => ({
            modality: m.modality,
            price: new Prisma.Decimal(m.price),
            enabled: m.enabled ?? true,
          })),
        },
      },
      include: { configs: { orderBy: { modality: 'asc' } } },
    });
  }

  async update(
    courierId: string,
    storeId: string,
    userId: string,
    dto: UpdateCourierDto,
  ) {
    await this.assertOwnership(storeId, userId);
    const existing = await this.prisma.courier.findUnique({
      where: { id: courierId },
    });
    if (!existing || existing.storeId !== storeId) {
      throw new NotFoundException('Courier no encontrado');
    }

    const modalities = dto.modalities;
    if (modalities) {
      const modList = modalities.map((m) => m.modality!);
      if (new Set(modList).size !== modList.length) {
        throw new BadRequestException(
          'No se pueden repetir modalidades en un mismo courier',
        );
      }

      return this.prisma.$transaction(async (tx) => {
        await tx.courierConfig.deleteMany({
          where: { courierId },
        });
        await tx.courierConfig.createMany({
          data: modalities.map((m) => ({
            courierId,
            modality: m.modality!,
            price: new Prisma.Decimal(m.price!),
            enabled: m.enabled ?? true,
          })),
        });
        return tx.courier.update({
          where: { id: courierId },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.enabled !== undefined && { enabled: dto.enabled }),
            ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          },
          include: { configs: { orderBy: { modality: 'asc' } } },
        });
      });
    }

    return this.prisma.courier.update({
      where: { id: courierId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
      include: { configs: { orderBy: { modality: 'asc' } } },
    });
  }

  async remove(courierId: string, storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    const existing = await this.prisma.courier.findUnique({
      where: { id: courierId },
    });
    if (!existing || existing.storeId !== storeId) {
      throw new NotFoundException('Courier no encontrado');
    }
    return this.prisma.courier.delete({
      where: { id: courierId },
      include: { configs: { orderBy: { modality: 'asc' } } },
    });
  }

  async findEnabledForSlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return this.prisma.courier.findMany({
      where: {
        storeId: store.id,
        enabled: true,
        configs: { some: { enabled: true } },
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        configs: {
          where: { enabled: true },
          orderBy: { modality: 'asc' },
        },
      },
    });
  }
}
