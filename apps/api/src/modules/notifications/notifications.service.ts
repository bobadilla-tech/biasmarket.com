import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  NotificationType,
  Prisma,
  Product,
  ProductVariant,
  Store,
} from "@biasmarket/db";
import { PrismaService } from "../../prisma/prisma.service.js";

type Client = Prisma.TransactionClient | PrismaService;

@Injectable()
export class NotificationsService {
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

  async findAllForStore(
    storeId: string,
    userId: string,
    filters: { archived?: boolean; read?: boolean },
  ) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.notification.findMany({
      where: {
        storeId,
        ...(filters.archived !== undefined && { archived: filters.archived }),
        ...(filters.read !== undefined && { read: filters.read }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async unreadCount(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    const count = await this.prisma.notification.count({
      where: { storeId, archived: false, read: false },
    });
    return { count };
  }

  async markRead(notificationId: string, storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.storeId !== storeId) {
      throw new NotFoundException("Notificación no encontrada");
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true, readAt: new Date() },
    });
  }

  async markAllRead(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.notification.updateMany({
      where: { storeId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  async archive(notificationId: string, storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.storeId !== storeId) {
      throw new NotFoundException("Notificación no encontrada");
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { archived: true, archivedAt: new Date() },
    });
  }

  async createIfNotOpen(
    params: {
      storeId: string;
      type: NotificationType;
      entityType: string;
      entityId: string;
      title: string;
      body?: string;
      metadata?: Record<string, unknown>;
    },
    client: Client = this.prisma,
  ) {
    const existing = await client.notification.findFirst({
      where: {
        storeId: params.storeId,
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        archived: false,
      },
    });
    if (existing) return null;
    return client.notification.create({
      data: {
        storeId: params.storeId,
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        title: params.title,
        body: params.body ?? "",
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async resolveOpenStockAlerts(
    storeId: string,
    entityType: string,
    entityId: string,
    client: Client = this.prisma,
  ) {
    return client.notification.updateMany({
      where: {
        storeId,
        entityType,
        entityId,
        archived: false,
        type: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
      },
      data: { archived: true, archivedAt: new Date() },
    });
  }

  async syncStockAlerts(
    client: Client,
    store: Store,
    product: Product,
    variant: ProductVariant,
  ) {
    if (!store.lowStockAlertsEnabled) return;

    await this.syncEntityStockAlert(
      client,
      store,
      "ProductVariant",
      variant.id,
      variant.stock === null ? null : variant.stock - variant.reserved,
      variant.name,
    );

    const siblingVariants = await client.productVariant.findMany({
      where: { productId: product.id },
    });
    const hasUnlimited = siblingVariants.some((v) => v.stock === null);
    const productAvailable = hasUnlimited ? null : siblingVariants.reduce(
      (sum, v) => sum + (v.stock ?? 0) - v.reserved,
      0,
    );

    await this.syncEntityStockAlert(
      client,
      store,
      "Product",
      product.id,
      productAvailable,
      product.name,
    );
  }

  private async syncEntityStockAlert(
    client: Client,
    store: Store,
    entityType: "ProductVariant" | "Product",
    entityId: string,
    available: number | null,
    name: string,
  ) {
    if (available === null) {
      await this.resolveOpenStockAlerts(store.id, entityType, entityId, client);
      return;
    }
    if (available <= 0) {
      await this.createIfNotOpen(
        {
          storeId: store.id,
          type: "OUT_OF_STOCK",
          entityType,
          entityId,
          title: `Sin stock: ${name}`,
          body: `${name} se quedó sin unidades disponibles.`,
        },
        client,
      );
      return;
    }
    if (available <= store.lowStockThreshold) {
      await this.createIfNotOpen(
        {
          storeId: store.id,
          type: "LOW_STOCK",
          entityType,
          entityId,
          title: `Stock bajo: ${name}`,
          body: `${name} tiene ${available} unidades disponibles.`,
        },
        client,
      );
      return;
    }
    await this.resolveOpenStockAlerts(store.id, entityType, entityId, client);
  }
}
