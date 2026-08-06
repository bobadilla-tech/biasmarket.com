import { Test, type TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { Prisma } from "@biasmarket/db";
import { StatsService } from "./stats.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("StatsService", () => {
  let service: StatsService;
  let prisma: {
    store: { findUnique: Mock };
    orderPayment: { aggregate: Mock };
    order: { groupBy: Mock; findMany: Mock };
    notification: { count: Mock };
    orderItem: { groupBy: Mock };
    product: { findMany: Mock };
  };

  const ownerId = "user-1";
  const storeId = "store-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      orderPayment: { aggregate: vi.fn() },
      order: { groupBy: vi.fn(), findMany: vi.fn() },
      notification: { count: vi.fn() },
      orderItem: { groupBy: vi.fn() },
      product: { findMany: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StatsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(StatsService);
  });

  function stubOwnedStore() {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
  }

  describe("ownership checks", () => {
    it("throws NotFoundException when the store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.getOverview(storeId, ownerId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws ForbiddenException when the user does not own the store", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: storeId,
        ownerId: "someone-else",
      });

      await expect(service.getOverview(storeId, ownerId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("getOverview", () => {
    beforeEach(() => {
      stubOwnedStore();
      prisma.orderPayment.aggregate.mockResolvedValue({
        _sum: { amount: 150 },
      });
      prisma.order.groupBy.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(2);
      prisma.order.findMany.mockResolvedValue([]);
    });

    it("scopes the revenue aggregate to VERIFIED payments for the store", async () => {
      await service.getOverview(storeId, ownerId);

      expect(prisma.orderPayment.aggregate).toHaveBeenCalledWith({
        where: { storeId, order: { paymentStatus: "VERIFIED" } },
        _sum: { amount: true },
      });
    });

    it("zero-fills every PaymentStatus and FulfillmentStatus bucket", async () => {
      prisma.order.groupBy.mockImplementation(({ by }: { by: string[] }) => {
        if (by[0] === "paymentStatus") {
          return Promise.resolve([{ paymentStatus: "VERIFIED", _count: 3 }]);
        }
        return Promise.resolve([{ fulfillmentStatus: "COMPLETED", _count: 3 }]);
      });

      const result = await service.getOverview(storeId, ownerId);

      expect(result.paymentStatusCounts).toEqual({
        PENDING_PAYMENT: 0,
        PARTIALLY_PAID: 0,
        PAYMENT_SUBMITTED: 0,
        VERIFIED: 3,
        REJECTED: 0,
        CANCELLED: 0,
      });
      expect(result.fulfillmentStatusCounts).toEqual({
        ORDERING: 0,
        IN_TRANSIT: 0,
        READY: 0,
        COMPLETED: 3,
      });
      expect(result.totalOrders).toBe(3);
    });

    it("counts open low-stock/out-of-stock notifications", async () => {
      const result = await service.getOverview(storeId, ownerId);

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          storeId,
          archived: false,
          type: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
        },
      });
      expect(result.lowStockCount).toBe(2);
    });

    it("computes paidAmount/pendingAmount/paidPercentage for recent orders", async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: "order-1",
          requiredAmount: new Prisma.Decimal(100),
          payments: [{ amount: new Prisma.Decimal(40) }],
        },
      ]);

      const result = await service.getOverview(storeId, ownerId);

      expect(result.recentOrders).toEqual([
        expect.objectContaining({
          id: "order-1",
          paidAmount: 40,
          pendingAmount: 60,
          paidPercentage: 40,
        }),
      ]);
    });

    it("limits recent orders to the 10 most recent, ordered by createdAt desc", async () => {
      await service.getOverview(storeId, ownerId);

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      );
    });
  });

  describe("getAnalytics", () => {
    beforeEach(() => stubOwnedStore());

    it("buckets revenue from VERIFIED orders only, and order count from every order", async () => {
      const now = new Date("2026-08-15T12:00:00Z");
      vi.useFakeTimers();
      vi.setSystemTime(now);

      prisma.order.findMany
        .mockResolvedValueOnce([
          {
            customerId: "customer-1",
            createdAt: new Date("2026-08-15T01:00:00Z"),
            paymentStatus: "VERIFIED",
            payments: [{ amount: 40 }],
          },
          {
            customerId: "customer-2",
            createdAt: new Date("2026-08-15T02:00:00Z"),
            paymentStatus: "PENDING_PAYMENT",
            payments: [],
          },
        ])
        .mockResolvedValueOnce([
          {
            customerId: "customer-1",
            createdAt: new Date("2026-08-15T01:00:00Z"),
          },
          {
            customerId: "customer-2",
            createdAt: new Date("2026-08-15T02:00:00Z"),
          },
        ]);
      prisma.orderItem.groupBy.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.getAnalytics(storeId, ownerId, "30d");

      const todayBucket = result.buckets[result.buckets.length - 1];
      expect(todayBucket.revenue).toBe(40);
      expect(todayBucket.orderCount).toBe(2);

      vi.useRealTimers();
    });

    it("classifies a customer as new only in the bucket containing their first-ever order", async () => {
      const now = new Date("2026-08-15T12:00:00Z");
      vi.useFakeTimers();
      vi.setSystemTime(now);

      prisma.order.findMany
        .mockResolvedValueOnce([
          {
            customerId: "customer-1",
            createdAt: new Date("2026-08-15T01:00:00Z"),
            paymentStatus: "VERIFIED",
            payments: [],
          },
        ])
        .mockResolvedValueOnce([
          // This customer's first-ever order was before the visible range —
          // they must still be "returning", not "new", inside the range.
          {
            customerId: "customer-1",
            createdAt: new Date("2026-01-01T00:00:00Z"),
          },
          {
            customerId: "customer-1",
            createdAt: new Date("2026-08-15T01:00:00Z"),
          },
        ]);
      prisma.orderItem.groupBy.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.getAnalytics(storeId, ownerId, "30d");

      const todayBucket = result.buckets[result.buckets.length - 1];
      expect(todayBucket.newCustomers).toBe(0);
      expect(todayBucket.returningCustomers).toBe(1);

      vi.useRealTimers();
    });

    it("resolves top product names from the aggregated orderItem groupBy", async () => {
      prisma.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.orderItem.groupBy.mockResolvedValue([
        { productId: "product-1", _sum: { quantity: 12 } },
      ]);
      prisma.product.findMany.mockResolvedValue([{
        id: "product-1",
        name: "Widget",
      }]);

      const result = await service.getAnalytics(storeId, ownerId, "30d");

      expect(result.topProducts).toEqual([{
        productId: "product-1",
        name: "Widget",
        unitsSold: 12,
      }]);
    });
  });
});
