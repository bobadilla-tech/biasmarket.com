import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { SuggestionsService } from "./suggestions.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("SuggestionsService", () => {
  let service: SuggestionsService;
  let prisma: {
    store: { findUnique: Mock };
    notification: { count: Mock };
    order: { count: Mock };
    orderItem: { groupBy: Mock };
    product: { findUnique: Mock };
  };

  const ownerId = "user-1";
  const storeId = "store-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      notification: { count: vi.fn() },
      order: { count: vi.fn() },
      orderItem: { groupBy: vi.fn() },
      product: { findUnique: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SuggestionsService, {
        provide: PrismaService,
        useValue: prisma,
      }],
    }).compile();

    service = module.get(SuggestionsService);
  });

  describe("ownership checks", () => {
    it("throws NotFoundException when the store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);
      await expect(service.getSuggestions(storeId, ownerId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws ForbiddenException when the user does not own the store", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: storeId,
        ownerId: "someone-else",
      });
      await expect(service.getSuggestions(storeId, ownerId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("getSuggestions", () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({
        id: storeId,
        ownerId,
        holdWindowHours: 48,
      });
    });

    it("returns no suggestions when every rule is quiet", async () => {
      prisma.notification.count.mockResolvedValue(0);
      prisma.order.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      prisma.orderItem.groupBy.mockResolvedValue([]);

      const result = await service.getSuggestions(storeId, ownerId);

      expect(result).toEqual([]);
    });

    it("surfaces the low-stock, stale-orders, and top-seller suggestions together", async () => {
      prisma.notification.count.mockResolvedValue(2);
      prisma.order.count.mockResolvedValueOnce(3).mockResolvedValueOnce(5);
      prisma.orderItem.groupBy.mockResolvedValue([{
        productId: "product-1",
        _sum: { quantity: 20 },
      }]);
      prisma.product.findUnique.mockResolvedValue({ name: "Widget" });

      const result = await service.getSuggestions(storeId, ownerId);

      expect(result).toEqual([
        {
          id: "low-stock",
          severity: "warning",
          titleKey: "lowStock",
          bodyParams: { count: 2 },
        },
        {
          id: "stale-orders",
          severity: "warning",
          titleKey: "staleOrders",
          bodyParams: { count: 3, hours: 48 },
        },
        {
          id: "top-seller",
          severity: "info",
          titleKey: "topSeller",
          bodyParams: { name: "Widget", count: 20 },
        },
      ]);
    });

    it("surfaces no-recent-orders when the store has had no orders in the last 7 days", async () => {
      prisma.notification.count.mockResolvedValue(0);
      prisma.order.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      prisma.orderItem.groupBy.mockResolvedValue([]);

      const result = await service.getSuggestions(storeId, ownerId);

      expect(result).toContainEqual({
        id: "no-recent-orders",
        severity: "info",
        titleKey: "noRecentOrders",
        bodyParams: { days: 7 },
      });
    });
  });
});
