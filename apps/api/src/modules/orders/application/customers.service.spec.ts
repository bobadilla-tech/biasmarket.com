import { Test, type TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { CustomersService } from "./customers.service.js";
import { PrismaService } from "../../../prisma/prisma.service.js";

describe("CustomersService", () => {
  let service: CustomersService;
  let prisma: {
    store: { findUnique: Mock };
    customer: { findMany: Mock; findUnique: Mock };
    order: { groupBy: Mock; findMany: Mock };
    orderPayment: { findMany: Mock };
  };

  const ownerId = "user-1";
  const storeId = "store-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      customer: { findMany: vi.fn(), findUnique: vi.fn() },
      order: { groupBy: vi.fn(), findMany: vi.fn() },
      orderPayment: { findMany: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomersService, {
        provide: PrismaService,
        useValue: prisma,
      }],
    }).compile();

    service = module.get(CustomersService);
  });

  function stubOwnedStore() {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
  }

  describe("ownership checks", () => {
    it("throws NotFoundException when the store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);
      await expect(service.findAllForStore(storeId, ownerId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws ForbiddenException when the user does not own the store", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: storeId,
        ownerId: "someone-else",
      });
      await expect(service.findAllForStore(storeId, ownerId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("findAllForStore", () => {
    beforeEach(() => stubOwnedStore());

    it("counts orders, sums only VERIFIED payments, and tracks the last order date per customer", async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: "customer-1",
          name: "Ana",
          phone: "+51987654321",
          email: "ana@example.com",
          emailVerified: true,
          createdAt: new Date("2026-01-01"),
        },
        {
          id: "customer-2",
          name: null,
          phone: "+51999999999",
          email: null,
          emailVerified: false,
          createdAt: new Date("2026-01-02"),
        },
      ]);
      prisma.order.groupBy.mockResolvedValue([
        {
          customerId: "customer-1",
          _count: 3,
          _max: { createdAt: new Date("2026-02-01") },
        },
        {
          customerId: "customer-2",
          _count: 1,
          _max: { createdAt: new Date("2026-01-15") },
        },
      ]);
      prisma.orderPayment.findMany.mockResolvedValue([
        { amount: 50, order: { customerId: "customer-1" } },
        { amount: 30, order: { customerId: "customer-1" } },
      ]);

      const result = await service.findAllForStore(storeId, ownerId);

      expect(result).toEqual([
        expect.objectContaining({
          id: "customer-1",
          orderCount: 3,
          lifetimeSpend: 80,
        }),
        expect.objectContaining({
          id: "customer-2",
          orderCount: 1,
          lifetimeSpend: 0,
        }),
      ]);
    });

    it("excludes non-VERIFIED payments from lifetime spend", async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: "customer-1",
          name: "Ana",
          phone: "+51987654321",
          email: null,
          emailVerified: false,
          createdAt: new Date(),
        },
      ]);
      prisma.order.groupBy.mockResolvedValue([]);
      // orderPayment.findMany is called with a where that already excludes
      // non-VERIFIED orders at the query level, so simulate that filter here.
      prisma.orderPayment.findMany.mockResolvedValue([]);

      const result = await service.findAllForStore(storeId, ownerId);

      expect(prisma.orderPayment.findMany).toHaveBeenCalledWith({
        where: {
          storeId,
          order: { paymentStatus: "VERIFIED", customerId: { not: null } },
        },
        select: { amount: true, order: { select: { customerId: true } } },
      });
      expect(result[0].lifetimeSpend).toBe(0);
    });
  });

  describe("findOneForStore", () => {
    beforeEach(() => stubOwnedStore());

    it("throws NotFoundException when the customer belongs to a different store", async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: "other-store",
      });
      await expect(service.findOneForStore("customer-1", storeId, ownerId))
        .rejects.toThrow(
          NotFoundException,
        );
    });

    it("returns the customer plus their order history with payment summaries", async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId,
        name: "Ana",
        phone: "+51987654321",
        email: "ana@example.com",
        emailVerified: true,
        createdAt: new Date(),
      });
      prisma.order.findMany.mockResolvedValue([
        { id: "order-1", requiredAmount: 100, payments: [{ amount: 40 }] },
      ]);

      const result = await service.findOneForStore(
        "customer-1",
        storeId,
        ownerId,
      );

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId, customerId: "customer-1" },
        }),
      );
      expect(result.orders).toEqual([
        expect.objectContaining({
          id: "order-1",
          paidAmount: 40,
          pendingAmount: 60,
          paidPercentage: 40,
        }),
      ]);
    });
  });
});
