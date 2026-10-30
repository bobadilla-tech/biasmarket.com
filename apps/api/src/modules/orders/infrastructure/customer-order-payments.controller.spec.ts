import { Test, type TestingModule } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import { type Mock, vi } from "vitest";

vi.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class AuthGuard {},
  Public: () => () => undefined,
  Session: () => () => undefined,
}));

import { CustomerOrderPaymentsController } from "./customer-order-payments.controller.js";
import { OrderRepository } from "./order.repository.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { StorageService } from "../../../storage/storage.service.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { OrderEventsService } from "../application/order-events.service.js";
import { BuyerPaymentProofService } from "../application/buyer-payment-proof.service.js";
import { CustomerSessionGuard } from "../../customer-auth/customer-session.guard.js";

describe("CustomerOrderPaymentsController.submit", () => {
  let controller: CustomerOrderPaymentsController;
  let events: { record: Mock };
  let tx: {
    $queryRaw: Mock;
    order: { findFirst: Mock };
    orderPayment: { findMany: Mock; create: Mock };
  };

  const orderId = "order-1";

  beforeEach(async () => {
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      order: {
        findFirst: vi.fn().mockResolvedValue({
          status: "ACTIVE",
          paymentStatus: "PENDING_PAYMENT",
          fulfillmentStatus: "ORDERING",
          expiresAt: null,
          requiredAmount: 100,
        }),
      },
      orderPayment: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({
          id: "payment-1",
          orderId,
          amount: 40,
          currency: "PEN",
          method: "YAPE",
          source: "BUYER_SUBMITTED",
          reviewStatus: "PENDING_REVIEW",
          createdAt: new Date("2026-08-05T00:00:00.000Z"),
        }),
      },
    };
    events = { record: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerOrderPaymentsController],
      providers: [
        {
          provide: OrderRepository,
          useValue: {
            findOrderForBuyer: vi.fn().mockResolvedValue({
              status: "ACTIVE",
              expiresAt: null,
              paymentStatus: "PENDING_PAYMENT",
              fulfillmentStatus: "ORDERING",
              pendingAmount: 100,
              requiredAmount: 100,
              currency: "PEN",
              payments: [],
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            store: { findUnique: vi.fn().mockResolvedValue({ id: "store-1" }) },
            $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadPaymentImage: vi.fn().mockResolvedValue("url"),
            deleteImage: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationsService,
          useValue: { createIfNotOpen: vi.fn() },
        },
        { provide: OrderEventsService, useValue: events },
        BuyerPaymentProofService,
      ],
    })
      .overrideGuard(CustomerSessionGuard)
      .useValue({})
      .overrideGuard(ThrottlerGuard)
      .useValue({})
      .compile();

    controller = module.get(CustomerOrderPaymentsController);
  });

  it("records a buyer-actor PAYMENT_SUBMITTED event carrying the new paymentId", async () => {
    await controller.submit(
      "my-store",
      orderId,
      { buyerAccountId: "buyer-1" },
      "40",
      "YAPE",
      undefined,
      { buffer: Buffer.from("x"), detectedMimeType: "image/png" } as any,
    );

    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId: "store-1",
      type: "PAYMENT_SUBMITTED",
      actor: "BUYER",
      payload: { paymentId: "payment-1", amount: 40, method: "YAPE" },
    });
  });
});
