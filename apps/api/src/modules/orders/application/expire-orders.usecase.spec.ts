import { Test, type TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { ExpireOrdersUseCase } from "./expire-orders.usecase.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { NotificationsService } from "../../notifications/notifications.service.js";

describe("ExpireOrdersUseCase", () => {
  let useCase: ExpireOrdersUseCase;
  let prisma: {
    order: { findMany: Mock; updateMany: Mock };
    auditLog: { create: Mock };
    productVariant: { findUnique: Mock; update: Mock };
    store: { findUnique: Mock };
    product: { findUnique: Mock };
    $transaction: Mock;
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn() },
      productVariant: { findUnique: vi.fn(), update: vi.fn() },
      store: { findUnique: vi.fn() },
      product: { findUnique: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpireOrdersUseCase,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NotificationsService,
          useValue: { syncStockAlerts: vi.fn() },
        },
      ],
    }).compile();

    useCase = module.get(ExpireOrdersUseCase);
  });

  it("cancels expired PENDING_PAYMENT orders and releases finite-stock holds", async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: "order-1",
        storeId: "store-1",
        items: [{ variantId: "variant-1", quantity: 2 }],
      },
    ]);
    prisma.productVariant.findUnique.mockResolvedValue({
      id: "variant-1",
      stock: 5,
    });

    const result = await useCase.execute();

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: "variant-1" },
      data: { reserved: { decrement: 2 } },
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", paymentStatus: "PENDING_PAYMENT" },
      data: { status: "CANCELLED", paymentStatus: "CANCELLED" },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: "system",
        storeId: "store-1",
        action: "order.expired",
        entityType: "Order",
        entityId: "order-1",
        metadata: {},
      },
    });
    expect(result).toEqual({ cancelled: 1 });
  });

  it("skips releasing stock for unlimited (null stock) variants", async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: "order-1", items: [{ variantId: "variant-1", quantity: 1 }] },
    ]);
    prisma.productVariant.findUnique.mockResolvedValue({
      id: "variant-1",
      stock: null,
    });

    await useCase.execute();

    expect(prisma.productVariant.update).not.toHaveBeenCalled();
  });

  it("returns cancelled: 0 when nothing has expired", async () => {
    prisma.order.findMany.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual({ cancelled: 0 });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("skips stock mutation when another request already changed the order's status", async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: "order-1", items: [{ variantId: "variant-1", quantity: 2 }] },
    ]);
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    const result = await useCase.execute();

    expect(prisma.productVariant.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelled: 0 });
  });
});
