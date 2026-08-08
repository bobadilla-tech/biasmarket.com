import { Test, type TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";

vi.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
}));

vi.mock("@nestjs/throttler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nestjs/throttler")>();
  return { ...actual, ThrottlerGuard: class ThrottlerGuard {} };
});

import { OrderController } from "./order.controller.js";
import { OrderRepository } from "./order.repository.js";
import { ReviewPaymentUseCase } from "../application/review-payment.usecase.js";
import { AdvanceFulfillmentUseCase } from "../application/advance-fulfillment.usecase.js";
import { CancelOrderUseCase } from "../application/cancel-order.usecase.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { StorageService } from "../../../storage/storage.service.js";

describe("OrderController.addPayment", () => {
  let controller: OrderController;
  let orders: {
    assertOwnership: Mock;
    findRowByIdForStore: Mock;
    saveStatus: Mock;
  };
  let reviewPayment: { execute: Mock };
  let prisma: { $transaction: Mock; orderPayment: { create: Mock } };
  let tx: { orderPayment: { create: Mock }; auditLog: { create: Mock } };

  const storeId = "store-1";
  const orderId = "order-1";
  const userId = "user-1";
  const session = { user: { id: userId } } as any;

  const fullOrderFixture = {
    id: orderId,
    storeId,
    customerId: null,
    customerEmail: null,
    customerPhone: "+51999999999",
    customerName: null,
    deliveryMethodType: "COURIER",
    deliveryDetails: {},
    pickupPointId: null,
    paymentStatus: "PARTIALLY_PAID",
    paymentRejectionReason: null,
    fulfillmentStatus: "ORDERING",
    status: "ACTIVE",
    cancellationResolution: null,
    cancellationReason: null,
    totalAmount: { toString: () => "100.00" },
    requiredAmount: { toString: () => "100.00" },
    currency: "PEN",
    expiresAt: new Date("2026-08-10T00:00:00.000Z"),
    createdAt: new Date("2026-08-05T00:00:00.000Z"),
    paidAmount: 40,
    pendingAmount: 60,
    paidPercentage: 40,
    items: [],
    payments: [],
    proofs: [],
  };

  beforeEach(async () => {
    tx = {
      orderPayment: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
      orderPayment: tx.orderPayment,
    };
    orders = {
      assertOwnership: vi.fn(),
      findRowByIdForStore: vi.fn(),
      saveStatus: vi.fn(),
    };
    reviewPayment = { execute: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderRepository, useValue: orders },
        { provide: ReviewPaymentUseCase, useValue: reviewPayment },
        { provide: AdvanceFulfillmentUseCase, useValue: { execute: vi.fn() } },
        { provide: CancelOrderUseCase, useValue: { execute: vi.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: { uploadPaymentImage: vi.fn() } },
      ],
    }).compile();

    controller = module.get(OrderController);
  });

  it("a partial payment writes PARTIALLY_PAID directly, audits it, and never calls ReviewPaymentUseCase", async () => {
    orders.findRowByIdForStore
      .mockResolvedValueOnce({
        currency: "PEN",
        paidAmount: 0,
        pendingAmount: 100,
        requiredAmount: "100.00",
      })
      .mockResolvedValueOnce(fullOrderFixture);

    await controller.addPayment(storeId, orderId, session, "40", "YAPE");

    expect(orders.saveStatus).toHaveBeenCalledWith(
      orderId,
      { paymentStatus: "PARTIALLY_PAID" },
      expect.anything(),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: userId,
        storeId,
        action: "payment.partial",
        entityType: "Order",
        entityId: orderId,
        metadata: {
          amount: 40,
          method: "YAPE",
          resultingPaymentStatus: "PARTIALLY_PAID",
        },
      },
    });
    expect(reviewPayment.execute).not.toHaveBeenCalled();
  });

  it("a payment reaching the required amount routes through ReviewPaymentUseCase instead of writing VERIFIED directly", async () => {
    orders.findRowByIdForStore
      .mockResolvedValueOnce({
        currency: "PEN",
        paidAmount: 60,
        pendingAmount: 40,
        requiredAmount: "100.00",
      })
      .mockResolvedValueOnce(fullOrderFixture);

    await controller.addPayment(storeId, orderId, session, "40", "YAPE");

    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).toHaveBeenCalledWith(
      orderId,
      storeId,
      userId,
      "approve",
    );
  });

  it("accepts a payment for exactly the displayed pendingAmount even when it's a float-trap value like 59.99", async () => {
    orders.findRowByIdForStore
      .mockResolvedValueOnce({
        currency: "PEN",
        paidAmount: 40,
        pendingAmount: 59.99,
        requiredAmount: "99.99",
      })
      .mockResolvedValueOnce(fullOrderFixture);

    await controller.addPayment(storeId, orderId, session, "59.99", "YAPE");

    expect(reviewPayment.execute).toHaveBeenCalledWith(
      orderId,
      storeId,
      userId,
      "approve",
    );
  });
});
