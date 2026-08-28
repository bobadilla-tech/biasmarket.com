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

type BulkSaveInput = {
  couriers: {
    id?: string;
    name: string;
    enabled?: boolean;
    sortOrder?: number;
    modalities: {
      modality: 'AGENCY' | 'HOME';
      price: number;
      enabled?: boolean;
    }[];
  }[];
  deletedIds: string[];
};

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
      const modList = modalities.map((m) => m.modality);
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
            modality: m.modality,
            price: new Prisma.Decimal(m.price),
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

  async bulkSave(storeId: string, userId: string, input: BulkSaveInput) {
    await this.assertOwnership(storeId, userId);

    // Guard duplicate names within the payload before touching the DB — the
    // `@@unique([storeId, name])` constraint would otherwise surface as a raw
    // Prisma P2002 (HTTP 500) once the second row hits `create`.
    const names = input.couriers.map((c) => c.name);
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('No se pueden repetir nombres de courier');
    }

    try {
      return await this.bulkSaveTransaction(storeId, input);
    } catch (err) {
      // A name that collides with an existing courier not in `deletedIds`
      // still reaches the DB — translate the unique-constraint violation into
      // a 400 instead of leaking a 500.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException('Ya existe un courier con ese nombre');
      }
      throw err;
    }
  }

  private async bulkSaveTransaction(storeId: string, input: BulkSaveInput) {
    return this.prisma.$transaction(async (tx) => {
      // Delete removed couriers (cascade deletes configs)
      if (input.deletedIds.length > 0) {
        await tx.courier.deleteMany({
          where: { id: { in: input.deletedIds }, storeId },
        });
      }

      // Process each courier: create or update
      const results: Prisma.CourierGetPayload<{
        include: { configs: true };
      }>[] = [];
      for (const c of input.couriers) {
        // Validate no duplicate modalities
        if (
          new Set(c.modalities.map((m) => m.modality)).size !==
          c.modalities.length
        ) {
          throw new BadRequestException(
            'No se pueden repetir modalidades en un mismo courier',
          );
        }

        // Resolve existing courier by id (if provided) and verify store ownership
        let existing: { id: string; storeId: string } | null = null;
        if (c.id) {
          existing = await tx.courier.findUnique({
            where: { id: c.id },
          });
          if (existing && existing.storeId !== storeId) {
            existing = null;
          }
        }

        let courier;
        if (existing) {
          // Update: replace modalities
          await tx.courierConfig.deleteMany({
            where: { courierId: existing.id },
          });
          await tx.courierConfig.createMany({
            data: c.modalities.map((m) => ({
              courierId: existing.id,
              modality: m.modality,
              price: new Prisma.Decimal(m.price),
              enabled: m.enabled ?? true,
            })),
          });
          courier = await tx.courier.update({
            where: { id: existing.id },
            data: {
              enabled: c.enabled ?? true,
              sortOrder: c.sortOrder ?? 0,
            },
            include: { configs: { orderBy: { modality: 'asc' } } },
          });
        } else {
          // Create
          courier = await tx.courier.create({
            data: {
              storeId,
              name: c.name,
              enabled: c.enabled ?? true,
              sortOrder: c.sortOrder ?? 0,
              configs: {
                create: c.modalities.map((m) => ({
                  modality: m.modality,
                  price: new Prisma.Decimal(m.price),
                  enabled: m.enabled ?? true,
                })),
              },
            },
            include: { configs: { orderBy: { modality: 'asc' } } },
          });
        }
        results.push(courier);
      }

      return results;
    });
  }
}
