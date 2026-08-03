import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { UpsertPaymentMethodDto } from "./dto/upsert-payment-method.dto.js";

@Injectable()
export class PaymentConfigService {
  constructor(private prisma: PrismaService) {}

  private async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No sos dueño de esta store");
    }
    return store;
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.paymentMethodConfig.findMany({ where: { storeId } });
  }

  async findEnabledForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.paymentMethodConfig.findMany({
      where: { storeId, enabled: true },
    });
  }

  async upsert(storeId: string, userId: string, dto: UpsertPaymentMethodDto) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.paymentMethodConfig.upsert({
      where: { storeId_method: { storeId, method: dto.method } },
      create: {
        storeId,
        method: dto.method,
        enabled: dto.enabled ?? true,
        details: {},
      },
      update: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
    });
  }

  async findEnabledForSlug(slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
    });

    if (!store) {
      throw new NotFoundException("Store no encontrada");
    }

    return this.prisma.paymentMethodConfig.findMany({
      where: {
        storeId: store.id,
        enabled: true,
      },
    });
  }
}
