import { Test, type TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { CancelOrderUseCase } from "./cancel-order.usecase.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { OrderRepository } from "../infrastructure/order.repository.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { OrderEventsService } from "./order-events.service.js";

describe("CancelOrderUseCase", () => {
  let useCase: CancelOrderUseCase;
  let events: { record: Mock };
  let prisma: {
    order: { updateMany: Mock; findUniqueOrThrow: Mock };
    orderPayment: { findMany: Mock; updateMany: Mock };
    auditLog: { create: Mock };
    $transaction: Mock;
  };

  beforeEach(async () => {
    prisma = {
      order: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "order-1" }),
      },
      orderPayment: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    events = { record: vi.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CancelOrderUseCase,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OrderRepository,
          useValue: {
            assertOwnership: vi.fn(),
            findRowByIdForStore: vi.fn().mockResolvedValue({
              id: "order-1",
              storeId: "store-1",
              paymentStatus: "VERIFIED",
              fulfillmentStatus: "ORDERING",
              paidAmount: 0,
              items: [],
            }),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            syncStockAlerts: vi.fn().mockResolvedValue([]),
            enqueueStockAlertPushes: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: OrderEventsService, useValue: events },
      ],
    }).compile();
    useCase = module.get(CancelOrderUseCase);
  });

  it("records ORDER_CANCELLED in the cancellation transaction", async () => {
    await useCase.execute("order-1", "store-1", "seller-1", {
      resolution: "REFUNDED",
    });

    expect(events.record).toHaveBeenCalledWith(prisma, {
      orderId: "order-1",
      storeId: "store-1",
      type: "ORDER_CANCELLED",
      actor: "SELLER",
      payload: { resolution: "REFUNDED" },
    });
  });

  it("closes pending buyer proofs and records a proof rejection event", async () => {
    prisma.orderPayment.findMany.mockResolvedValue([{ id: "proof-1" }]);

    await useCase.execute("order-1", "store-1", "seller-1", {
      resolution: "REFUNDED",
    });

    expect(prisma.orderPayment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "proof-1",
        orderId: "order-1",
        storeId: "store-1",
        source: "BUYER_SUBMITTED",
        reviewStatus: "PENDING_REVIEW",
      },
      data: {
        reviewStatus: "REJECTED",
        rejectionReason:
          "El pedido se cerró antes de revisar este comprobante.",
        reviewedAt: expect.any(Date),
        reviewedBy: "seller-1",
      },
    });
    expect(events.record).toHaveBeenCalledWith(prisma, {
      orderId: "order-1",
      storeId: "store-1",
      type: "PAYMENT_REJECTED",
      actor: "SELLER",
      payload: { paymentId: "proof-1" },
    });
  });
});
