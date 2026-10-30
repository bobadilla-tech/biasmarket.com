import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { CreatePickupPointDto } from "./dto/create-pickup-point.dto.js";
import type { UpdatePickupPointDto } from "./dto/update-pickup-point.dto.js";

@Injectable()
export class PickupPointsService {
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

  private async findOwnedPoint(
    pointId: string,
    storeId: string,
    userId: string,
  ) {
    await this.assertOwnership(storeId, userId);
    const point = await this.prisma.pickupPoint.findUnique({
      where: { id: pointId },
    });
    if (!point || point.storeId !== storeId) {
      throw new NotFoundException("Punto de recojo no encontrado");
    }
    return point;
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.pickupPoint.findMany({
      where: { storeId },
      orderBy: { sortOrder: "asc" },
    });
  }

  async create(storeId: string, userId: string, dto: CreatePickupPointDto) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.pickupPoint.create({
      data: {
        storeId,
        label: dto.label,
        enabled: dto.enabled ?? true,
        sortOrder: dto.sortOrder ?? 0,
        openDays: dto.openDays ?? [],
        closedOverride: dto.closedOverride ?? false,
      },
    });
  }

  async update(
    pointId: string,
    storeId: string,
    userId: string,
    dto: UpdatePickupPointDto,
  ) {
    await this.findOwnedPoint(pointId, storeId, userId);
    return this.prisma.pickupPoint.update({
      where: { id: pointId },
      data: dto,
    });
  }

  async remove(pointId: string, storeId: string, userId: string) {
    await this.findOwnedPoint(pointId, storeId, userId);
    return this.prisma.pickupPoint.delete({ where: { id: pointId } });
  }

  async findEnabledForSlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException("Tienda no encontrada");
    return this.prisma.pickupPoint.findMany({
      where: { storeId: store.id, enabled: true },
      orderBy: { sortOrder: "asc" },
    });
  }
}
