import { Test, type TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { Prisma } from "@biasmarket/db";
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
    // Guest orders are fetched in `findAllForStore` and have their own
    // aggregation; tests that don't care about them still need a default so
    // the iteration over them doesn't blow up on `undefined`.
    prisma.order.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
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
          createdAt: new Date("2026-01-02"),
        },
        {
          id: "customer-2",
          name: null,
          phone: "+51999999999",
          email: null,
          emailVerified: false,
          createdAt: new Date("2026-01-01"),
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
        {
          amount: 50,
          source: "SELLER_RECORDED",
          reviewStatus: "N_A",
          order: { customerId: "customer-1" },
        },
        {
          amount: 30,
          source: "SELLER_RECORDED",
          reviewStatus: "N_A",
          order: { customerId: "customer-1" },
        },
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

    it("excludes payments from non-collecting orders from lifetime spend", async () => {
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
          order: {
            paymentStatus: { in: ["VERIFIED", "PARTIALLY_PAID"] },
            customerId: { not: null },
          },
          OR: [{ source: "SELLER_RECORDED" }, { reviewStatus: "APPROVED" }],
        },
        select: { amount: true, order: { select: { customerId: true } } },
      });
      expect(result[0].lifetimeSpend).toBe(0);
    });

    it("includes guest orders (no linked customer) as synthetic customers grouped by normalized phone", async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.order.groupBy.mockResolvedValue([]);
      prisma.orderPayment.findMany.mockResolvedValue([]);
      // Two differently-formatted-but-equivalent phones plus a second guest.
      prisma.order.findMany.mockResolvedValue([
        {
          customerPhone: "+51 987 654 321",
          customerName: "Ana",
          customerEmail: null,
          paymentStatus: "VERIFIED",
          createdAt: new Date("2026-03-01"),
          payments: [
            {
              amount: new Prisma.Decimal(40),
              source: "SELLER_RECORDED",
              reviewStatus: "N_A",
            },
          ],
        },
        {
          customerPhone: "51987654321",
          customerName: null,
          customerEmail: "ana@example.com",
          paymentStatus: "PENDING_PAYMENT",
          createdAt: new Date("2026-03-10"),
          payments: [],
        },
        {
          customerPhone: "+51999999999",
          customerName: "Beto",
          customerEmail: null,
          paymentStatus: "VERIFIED",
          createdAt: new Date("2026-02-01"),
          payments: [
            {
              amount: new Prisma.Decimal(10),
              source: "SELLER_RECORDED",
              reviewStatus: "N_A",
            },
          ],
        },
      ]);

      const result = await service.findAllForStore(storeId, ownerId);

      expect(result).toHaveLength(2);
      const ana = result.find((r) => r.id === "guest_51987654321");
      const beto = result.find((r) => r.id === "guest_51999999999");
      expect(ana).toEqual({
        id: "guest_51987654321",
        name: "Ana",
        phone: "+51987654321",
        email: "ana@example.com",
        emailVerified: false,
        createdAt: new Date("2026-03-01"),
        orderCount: 2,
        lifetimeSpend: 40,
        lastOrderAt: new Date("2026-03-10"),
      });
      expect(beto).toEqual({
        id: "guest_51999999999",
        name: "Beto",
        phone: "+51999999999",
        email: null,
        emailVerified: false,
        createdAt: new Date("2026-02-01"),
        orderCount: 1,
        lifetimeSpend: 10,
        lastOrderAt: new Date("2026-02-01"),
      });
      // Sorted by (synthetic) createdAt desc, newest first.
      expect(result.map((r) => r.id)).toEqual([
        "guest_51987654321",
        "guest_51999999999",
      ]);
    });

    it("excludes a PENDING_REVIEW buyer-submitted payment from guest lifetimeSpend", async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.order.groupBy.mockResolvedValue([]);
      prisma.orderPayment.findMany.mockResolvedValue([]);
      prisma.order.findMany.mockResolvedValue([
        {
          customerPhone: "+51987654321",
          customerName: "Ana",
          customerEmail: null,
          paymentStatus: "VERIFIED",
          createdAt: new Date("2026-03-01"),
          payments: [
            {
              amount: new Prisma.Decimal(40),
              source: "SELLER_RECORDED",
              reviewStatus: "N_A",
            },
            {
              amount: new Prisma.Decimal(1000),
              source: "BUYER_SUBMITTED",
              reviewStatus: "PENDING_REVIEW",
            },
          ],
        },
      ]);

      const result = await service.findAllForStore(storeId, ownerId);

      expect(result).toHaveLength(1);
      expect(result[0].lifetimeSpend).toBe(40);
    });

    it("counts only the verified amount of a PARTIALLY_PAID guest order in lifetimeSpend", async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.order.groupBy.mockResolvedValue([]);
      prisma.orderPayment.findMany.mockResolvedValue([]);
      prisma.order.findMany.mockResolvedValue([
        {
          customerPhone: "+51987654321",
          customerName: "Ana",
          customerEmail: null,
          paymentStatus: "PARTIALLY_PAID",
          createdAt: new Date("2026-03-01"),
          payments: [
            {
              amount: new Prisma.Decimal(30),
              source: "SELLER_RECORDED",
              reviewStatus: "N_A",
            },
          ],
        },
      ]);

      const result = await service.findAllForStore(storeId, ownerId);

      expect(result).toHaveLength(1);
      // The 100 order's 30 deposit, not the full total and not zero.
      expect(result[0].lifetimeSpend).toBe(30);
    });

    it("folds guest orders into an existing customer row with the same phone", async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: "customer-1",
          name: "Ana",
          phone: "+51987654321",
          email: "ana@example.com",
          emailVerified: true,
          createdAt: new Date("2026-01-01"),
        },
      ]);
      prisma.order.groupBy.mockResolvedValue([
        {
          customerId: "customer-1",
          _count: 1,
          _max: { createdAt: new Date("2026-01-05") },
        },
      ]);
      prisma.orderPayment.findMany.mockResolvedValue([
        {
          amount: 30,
          source: "SELLER_RECORDED",
          reviewStatus: "N_A",
          order: { customerId: "customer-1" },
        },
      ]);
      prisma.order.findMany.mockResolvedValue([
        {
          customerPhone: "51987654321",
          customerName: null,
          customerEmail: null,
          paymentStatus: "VERIFIED",
          createdAt: new Date("2026-06-01"),
          payments: [
            {
              amount: new Prisma.Decimal(20),
              source: "SELLER_RECORDED",
              reviewStatus: "N_A",
            },
          ],
        },
      ]);

      const result = await service.findAllForStore(storeId, ownerId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: "customer-1",
          orderCount: 2,
          lifetimeSpend: 50,
          lastOrderAt: new Date("2026-06-01"),
        }),
      );
    });
  });

  describe("findOneForStore", () => {
    beforeEach(() => stubOwnedStore());

    it("throws NotFoundException when the customer belongs to a different store", async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: "other-store",
      });
      await expect(
        service.findOneForStore("customer-1", storeId, ownerId),
      ).rejects.toThrow(NotFoundException);
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
        {
          id: "order-1",
          requiredAmount: new Prisma.Decimal(100),
          payments: [
            {
              amount: new Prisma.Decimal(40),
              source: "SELLER_RECORDED",
              reviewStatus: "N_A",
            },
          ],
        },
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

    it("resolves a guest synthetic id to its orders by normalized phone", async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.order.findMany.mockResolvedValue([
        {
          id: "order-g1",
          customerPhone: "+51 987 654 321",
          customerName: "Ana",
          customerEmail: "ana@example.com",
          requiredAmount: new Prisma.Decimal(100),
          createdAt: new Date("2026-03-01"),
          payments: [
            {
              amount: new Prisma.Decimal(40),
              source: "SELLER_RECORDED",
              reviewStatus: "N_A",
            },
          ],
        },
        {
          id: "order-g2",
          customerPhone: "51999999999",
          customerName: "Beto",
          customerEmail: null,
          requiredAmount: new Prisma.Decimal(50),
          createdAt: new Date("2026-02-01"),
          payments: [],
        },
      ]);

      const result = await service.findOneForStore(
        "guest_51987654321",
        storeId,
        ownerId,
      );

      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { storeId_phone: { storeId, phone: "+51987654321" } },
      });
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId, customerId: null },
        }),
      );
      expect(result.customer).toEqual({
        id: "guest_51987654321",
        name: "Ana",
        phone: "+51987654321",
        email: "ana@example.com",
        emailVerified: false,
        createdAt: new Date("2026-03-01"),
      });
      expect(result.orders).toEqual([
        expect.objectContaining({
          id: "order-g1",
          paidAmount: 40,
          pendingAmount: 60,
          paidPercentage: 40,
        }),
      ]);
    });

    it("throws NotFoundException when a guest id has no matching orders", async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.order.findMany.mockResolvedValue([
        {
          id: "order-g1",
          customerPhone: "+51999999999",
          customerName: "Beto",
          customerEmail: null,
          requiredAmount: new Prisma.Decimal(50),
          createdAt: new Date("2026-02-01"),
          payments: [],
        },
      ]);

      await expect(
        service.findOneForStore("guest_51987654321", storeId, ownerId),
      ).rejects.toThrow(NotFoundException);
    });

    it("falls through to the real customer when an account now exists for the guest phone", async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId,
        name: "Ana",
        phone: "+51987654321",
        email: "ana@example.com",
        emailVerified: true,
        createdAt: new Date("2026-01-01"),
      });
      prisma.order.findMany.mockResolvedValue([
        {
          id: "order-1",
          requiredAmount: new Prisma.Decimal(100),
          payments: [
            {
              amount: new Prisma.Decimal(40),
              source: "SELLER_RECORDED",
              reviewStatus: "N_A",
            },
          ],
        },
      ]);

      const result = await service.findOneForStore(
        "guest_51987654321",
        storeId,
        ownerId,
      );

      expect(prisma.customer.findUnique).toHaveBeenLastCalledWith({
        where: { id: "customer-1" },
      });
      expect(result.customer.id).toBe("customer-1");
      expect(result.orders).toEqual([
        expect.objectContaining({ id: "order-1" }),
      ]);
    });
  });
});
