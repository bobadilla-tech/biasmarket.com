import { Test, TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";

vi.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
}));

import { OrderController } from "./order.controller.js";
import { OrderRepository } from "./order.repository.js";
import { ReviewPaymentUseCase } from "../application/review-payment.usecase.js";
import { AdvanceFulfillmentUseCase } from "../application/advance-fulfillment.usecase.js";
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

  const storeId = "store-1";
  const orderId = "order-1";
  const userId = "user-1";
  const session = { user: { id: userId } } as any;

  beforeEach(async () => {
    const tx = { orderPayment: { create: vi.fn() } };
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
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: { uploadPaymentImage: vi.fn() } },
      ],
    }).compile();

    controller = module.get(OrderController);
  });

  it("a partial payment writes PARTIALLY_PAID directly and never calls ReviewPaymentUseCase", async () => {
    orders.findRowByIdForStore.mockResolvedValue({
      currency: "PEN",
      paidAmount: 0,
      pendingAmount: 100,
      requiredAmount: "100.00",
    });

    await controller.addPayment(storeId, orderId, session, "40", "YAPE");

    expect(orders.saveStatus).toHaveBeenCalledWith(
      orderId,
      { paymentStatus: "PARTIALLY_PAID" },
      expect.anything(),
    );
    expect(reviewPayment.execute).not.toHaveBeenCalled();
  });

  it("a payment reaching the required amount routes through ReviewPaymentUseCase instead of writing VERIFIED directly", async () => {
    orders.findRowByIdForStore.mockResolvedValue({
      currency: "PEN",
      paidAmount: 60,
      pendingAmount: 40,
      requiredAmount: "100.00",
    });

    await controller.addPayment(storeId, orderId, session, "40", "YAPE");

    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).toHaveBeenCalledWith(
      orderId,
      storeId,
      userId,
      "approve",
    );
  });
});
