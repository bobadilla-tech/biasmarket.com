import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { NotificationsService } from "./notifications.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("NotificationsService", () => {
  let service: NotificationsService;
  let prisma: {
    store: { findUnique: Mock };
    notification: {
      findFirst: Mock;
      findUnique: Mock;
      findMany: Mock;
      create: Mock;
      update: Mock;
      updateMany: Mock;
      count: Mock;
    };
    productVariant: { findMany: Mock };
  };

  const ownerId = "user-1";
  const storeId = "store-1";
  const notificationId = "notification-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      notification: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      productVariant: { findMany: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, {
        provide: PrismaService,
        useValue: prisma,
      }],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe("ownership checks", () => {
    it("throws NotFoundException when the store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.findAllForStore(storeId, ownerId, {})).rejects
        .toThrow(
          NotFoundException,
        );
    });

    it("throws ForbiddenException when the user does not own the store", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: storeId,
        ownerId: "someone-else",
      });

      await expect(service.unreadCount(storeId, ownerId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("findAllForStore", () => {
    it("scopes the query by storeId and applies filters", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.notification.findMany.mockResolvedValue([]);

      await service.findAllForStore(storeId, ownerId, {
        archived: false,
        read: true,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { storeId, archived: false, read: true },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("markRead / archive", () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it("throws NotFoundException when the notification belongs to a different store", async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: notificationId,
        storeId: "other-store",
      });

      await expect(service.markRead(notificationId, storeId, ownerId)).rejects
        .toThrow(
          NotFoundException,
        );
    });
  });

  describe("createIfNotOpen", () => {
    const params = {
      storeId,
      type: "LOW_STOCK" as const,
      entityType: "ProductVariant",
      entityId: "variant-1",
      title: "Stock bajo",
    };

    it("skips creating a duplicate when an open notification already exists", async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: "existing" });

      const result = await service.createIfNotOpen(params);

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it("creates a notification when no open one exists", async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: "new-1" });

      await service.createIfNotOpen(params);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          storeId,
          type: "LOW_STOCK",
          entityType: "ProductVariant",
          entityId: "variant-1",
          title: "Stock bajo",
          body: "",
          metadata: {},
        },
      });
    });
  });

  describe("resolveOpenStockAlerts", () => {
    it("archives open LOW_STOCK/OUT_OF_STOCK rows for the entity", async () => {
      await service.resolveOpenStockAlerts(
        storeId,
        "ProductVariant",
        "variant-1",
      );

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          storeId,
          entityType: "ProductVariant",
          entityId: "variant-1",
          archived: false,
          type: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
        },
        data: { archived: true, archivedAt: expect.any(Date) },
      });
    });
  });

  describe("syncStockAlerts", () => {
    const store = {
      id: storeId,
      lowStockThreshold: 3,
      lowStockAlertsEnabled: true,
    };
    const product = { id: "product-1", name: "Widget" };

    it("does nothing when alerts are disabled for the store", async () => {
      await service.syncStockAlerts(
        prisma as any,
        { ...store, lowStockAlertsEnabled: false } as any,
        product as any,
        { id: "variant-1", stock: 0, reserved: 0 } as any,
      );

      expect(prisma.notification.findFirst).not.toHaveBeenCalled();
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });

    it("creates OUT_OF_STOCK when available stock is zero or negative", async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.productVariant.findMany.mockResolvedValue([{
        stock: 5,
        reserved: 5,
      }]);

      await service.syncStockAlerts(
        prisma as any,
        store as any,
        product as any,
        { id: "variant-1", stock: 5, reserved: 5 } as any,
      );

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "OUT_OF_STOCK",
            entityType: "ProductVariant",
          }),
        }),
      );
    });

    it("creates LOW_STOCK when available stock is at or below the threshold", async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.productVariant.findMany.mockResolvedValue([{
        stock: 5,
        reserved: 3,
      }]);

      await service.syncStockAlerts(
        prisma as any,
        store as any,
        product as any,
        { id: "variant-1", stock: 5, reserved: 3 } as any,
      );

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "LOW_STOCK",
            entityType: "ProductVariant",
          }),
        }),
      );
    });

    it("resolves open alerts when available stock rises above the threshold", async () => {
      prisma.productVariant.findMany.mockResolvedValue([{
        stock: 20,
        reserved: 0,
      }]);

      await service.syncStockAlerts(
        prisma as any,
        store as any,
        product as any,
        { id: "variant-1", stock: 20, reserved: 0 } as any,
      );

      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: "ProductVariant",
            entityId: "variant-1",
          }),
        }),
      );
    });

    it("only resolves (never creates) for unlimited-stock variants", async () => {
      prisma.productVariant.findMany.mockResolvedValue([{
        stock: null,
        reserved: 0,
      }]);

      await service.syncStockAlerts(
        prisma as any,
        store as any,
        product as any,
        { id: "variant-1", stock: null, reserved: 0 } as any,
      );

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(prisma.notification.updateMany).toHaveBeenCalled();
    });
  });
});
