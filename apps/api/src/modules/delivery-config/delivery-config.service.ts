import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@biasmarket/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UpsertDeliveryMethodDto } from './dto/upsert-delivery-method.dto.js';

@Injectable()
export class DeliveryConfigService {
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
    return this.prisma.deliveryMethodConfig.findMany({ where: { storeId } });
  }

  async upsert(storeId: string, userId: string, dto: UpsertDeliveryMethodDto) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.deliveryMethodConfig.upsert({
      where: { storeId_type: { storeId, type: dto.type } },
      create: {
        storeId,
        type: dto.type,
        enabled: dto.enabled ?? true,
        details: (dto.details ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.details !== undefined && { details: dto.details as Prisma.InputJsonValue }),
      },
    });
  }

  async remove(storeId: string, userId: string, type: 'PICKUP' | 'COURIER') {
    await this.assertOwnership(storeId, userId);
    return this.prisma.deliveryMethodConfig.delete({
      where: { storeId_type: { storeId, type } },
    });
  }

  async findEnabledForSlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return this.prisma.deliveryMethodConfig.findMany({
      where: { storeId: store.id, enabled: true },
    });
  }
}
