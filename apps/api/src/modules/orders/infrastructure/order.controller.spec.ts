import { Test, type TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { Prisma } from "@biasmarket/db";

vi.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
}));

vi.mock("@nestjs/throttler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nestjs/throttler")>();
  return { ...actual, ThrottlerGuard: class ThrottlerGuard {} };
});

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DuplicateOperationCodeException } from "../domain/duplicate-operation-code.exception.js";
import {
  OrderController,
  type OrderPaymentRow,
  pickPublicOrderFields,
  toOrderPaymentDto,
} from "./order.controller.js";
import { OrderRepository } from "./order.repository.js";
import { ReviewPaymentUseCase } from "../application/review-payment.usecase.js";
import { AdvanceFulfillmentUseCase } from "../application/advance-fulfillment.usecase.js";
import { CancelOrderUseCase } from "../application/cancel-order.usecase.js";
import { VoidOrderPaymentUseCase } from "../application/void-order-payment.usecase.js";
import { OrderPaymentsService } from "../application/order-payments.service.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { StorageService } from "../../../storage/storage.service.js";
import { OrderEventsService } from "../application/order-events.service.js";

describe("toOrderPaymentDto", () => {
  it("does not expose private payment actor ids", () => {
    const payment = {
      id: "payment-1",
      orderId: "order-1",
      storeId: "store-1",
      amount: { toString: () => "12.00" },
      currency: "PEN",
      method: "YAPE",
      note: null,
      imageUrl: null,
      createdAt: new Date("2026-10-27T00:00:00.000Z"),
      operationCode: null,
      paidAt: null,
      voidedAt: null,
      voidReason: null,
      source: "SELLER_RECORDED",
      reviewStatus: "N_A",
      reviewedAt: null,
      reviewedBy: null,
      recordedBy: "seller-1",
      voidedBy: "seller-1",
    } as OrderPaymentRow;

    const response = toOrderPaymentDto(payment);

    expect(response).not.toHaveProperty("recordedBy");
    expect(response).not.toHaveProperty("voidedBy");
  });
});

describe("OrderController.addPayment", () => {
  let controller: OrderController;
  let orders: {
    assertOwnership: Mock;
    findRowByIdForStore: Mock;
    findPaymentForStore: Mock;
    saveStatus: Mock;
  };
  let reviewPayment: { execute: Mock };
  let paymentsService: { findDuplicateOperationCode: Mock };
  let storage: {
    uploadPaymentImage: Mock;
    getPaymentImageStream: Mock;
    deleteImage: Mock;
  };
  let events: { record: Mock };
  let prisma: {
    $transaction: Mock;
    orderPayment: { create: Mock };
  };
  let tx: {
    $queryRaw: Mock;
    order: {
      findUniqueOrThrow: Mock;
      findFirst: Mock;
      updateMany: Mock;
    };
    orderPayment: { create: Mock; findMany: Mock; aggregate: Mock };
    auditLog: { create: Mock };
  };

  const CAPTURE = {
    buffer: Buffer.from("x"),
    detectedMimeType: "image/png",
  } as never;

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
    source: "MARKETPLACE",
    deliveryMethodType: "COURIER",
    deliveryDetails: {},
    pickupPointId: null,
    pickupDate: null,
    courierName: null,
    courierModality: null,
    trackingNumber: null,
    trackingUrl: null,
    packedPhotoUrl: null,
    paymentMethod: null,
    paymentStatus: "PARTIALLY_PAID",
    paymentRejectionReason: null,
    fulfillmentStatus: "ORDERING",
    status: "ACTIVE",
    cancellationResolution: null,
    cancellationReason: null,
    retainedAmount: null,
    releasedAmount: null,
    releasedResolution: null,
    linkFirstOpenedAt: null,
    claimedAt: null,
    buyerConfirmedReceivedAt: null,
    createdBy: null,
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
  };

  beforeEach(async () => {
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      order: {
        findUniqueOrThrow: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      orderPayment: { create: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
      orderPayment: tx.orderPayment,
    };
    orders = {
      assertOwnership: vi.fn(),
      findRowByIdForStore: vi.fn(),
      findPaymentForStore: vi.fn(),
      saveStatus: vi.fn(),
    };
    reviewPayment = { execute: vi.fn() };
    paymentsService = {
      findDuplicateOperationCode: vi.fn().mockResolvedValue(null),
    };
    storage = {
      uploadPaymentImage: vi.fn(),
      getPaymentImageStream: vi.fn(),
      deleteImage: vi.fn().mockResolvedValue(undefined),
    };
    events = { record: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderRepository, useValue: orders },
        { provide: ReviewPaymentUseCase, useValue: reviewPayment },
        { provide: AdvanceFulfillmentUseCase, useValue: { execute: vi.fn() } },
        { provide: CancelOrderUseCase, useValue: { execute: vi.fn() } },
        { provide: VoidOrderPaymentUseCase, useValue: { execute: vi.fn() } },
        { provide: OrderPaymentsService, useValue: paymentsService },
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: OrderEventsService, useValue: events },
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

    tx.order.findUniqueOrThrow.mockResolvedValueOnce({
      paymentStatus: "PARTIALLY_PAID",
      requiredAmount: new Prisma.Decimal("100.00"),
      currency: "PEN",
    });
    tx.orderPayment.findMany.mockResolvedValueOnce([]);

    await controller.addPayment(
      storeId,
      orderId,
      session,
      "40",
      "YAPE",
      undefined,
      CAPTURE,
    );

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
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: "PAYMENT_SUBMITTED",
      actor: "SELLER",
      payload: { amount: 40, method: "YAPE" },
    });
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

    tx.order.findUniqueOrThrow.mockResolvedValueOnce({
      paymentStatus: "PARTIALLY_PAID",
      requiredAmount: new Prisma.Decimal("100.00"),
      currency: "PEN",
    });
    tx.orderPayment.findMany.mockResolvedValueOnce([
      {
        amount: new Prisma.Decimal(60),
        source: "SELLER_RECORDED",
        reviewStatus: "N_A",
        voidedAt: null,
      },
    ]);

    await controller.addPayment(
      storeId,
      orderId,
      session,
      "40",
      "YAPE",
      undefined,
      CAPTURE,
    );

    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).toHaveBeenCalledWith(
      orderId,
      storeId,
      userId,
      "approve",
    );
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: "PAYMENT_SUBMITTED",
      actor: "SELLER",
      payload: { amount: 40, method: "YAPE" },
    });
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

    tx.order.findUniqueOrThrow.mockResolvedValueOnce({
      paymentStatus: "PARTIALLY_PAID",
      requiredAmount: new Prisma.Decimal("99.99"),
      currency: "PEN",
    });
    tx.orderPayment.findMany.mockResolvedValueOnce([
      {
        amount: new Prisma.Decimal(40),
        source: "SELLER_RECORDED",
        reviewStatus: "N_A",
        voidedAt: null,
      },
    ]);

    await controller.addPayment(
      storeId,
      orderId,
      session,
      "59.99",
      "YAPE",
      undefined,
      CAPTURE,
    );

    expect(reviewPayment.execute).toHaveBeenCalledWith(
      orderId,
      storeId,
      userId,
      "approve",
    );
  });

  it("accepts a payment on an already-VERIFIED order with a residual balance, keeping it VERIFIED", async () => {
    orders.findRowByIdForStore
      .mockResolvedValueOnce({
        currency: "PEN",
        paymentStatus: "VERIFIED",
        paidAmount: 0,
        pendingAmount: 47,
        requiredAmount: "47.00",
      })
      .mockResolvedValueOnce(fullOrderFixture);

    tx.order.findUniqueOrThrow.mockResolvedValueOnce({
      paymentStatus: "VERIFIED",
      requiredAmount: new Prisma.Decimal("47.00"),
      currency: "PEN",
    });
    tx.orderPayment.findMany.mockResolvedValueOnce([]);

    await controller.addPayment(
      storeId,
      orderId,
      session,
      "27",
      "YAPE",
      undefined,
      CAPTURE,
    );

    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).not.toHaveBeenCalled();
    expect(tx.orderPayment.create).toHaveBeenCalledWith({
      data: {
        orderId,
        storeId,
        amount: 27,
        currency: "PEN",
        method: "YAPE",
        note: null,
        operationCode: null,
        paidAt: expect.any(Date),
        recordedBy: userId,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: userId,
        storeId,
        action: "payment.recorded",
        entityType: "Order",
        entityId: orderId,
        metadata: {
          amount: 27,
          method: "YAPE",
          resultingPaymentStatus: "VERIFIED",
        },
      },
    });
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: "PAYMENT_SUBMITTED",
      actor: "SELLER",
      payload: { amount: 27, method: "YAPE" },
    });
  });

  it("does not route an already-VERIFIED order through ReviewPaymentUseCase even when the payment settles the balance", async () => {
    orders.findRowByIdForStore
      .mockResolvedValueOnce({
        currency: "PEN",
        paymentStatus: "VERIFIED",
        paidAmount: 0,
        pendingAmount: 47,
        requiredAmount: "47.00",
      })
      .mockResolvedValueOnce(fullOrderFixture);

    tx.order.findUniqueOrThrow.mockResolvedValueOnce({
      paymentStatus: "VERIFIED",
      requiredAmount: new Prisma.Decimal("47.00"),
      currency: "PEN",
    });
    tx.orderPayment.findMany.mockResolvedValueOnce([]);

    await controller.addPayment(
      storeId,
      orderId,
      session,
      "47",
      "YAPE",
      undefined,
      CAPTURE,
    );

    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).not.toHaveBeenCalled();
    expect(tx.orderPayment.create).toHaveBeenCalled();
  });

  it("still rejects a payment on a VERIFIED order with no balance owed", async () => {
    orders.findRowByIdForStore.mockResolvedValueOnce({
      currency: "PEN",
      paymentStatus: "VERIFIED",
      paidAmount: 47,
      pendingAmount: 0,
      requiredAmount: "47.00",
    });

    await expect(
      controller.addPayment(
        storeId,
        orderId,
        session,
        "10",
        "YAPE",
        undefined,
        CAPTURE,
      ),
    ).rejects.toThrow("La orden ya está pagada");

    expect(tx.orderPayment.create).not.toHaveBeenCalled();
    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).not.toHaveBeenCalled();
  });

  describe("seller payment rules", () => {
    const pendingOrder = (overrides: Record<string, unknown> = {}) => ({
      currency: "PEN",
      paymentStatus: "PENDING_PAYMENT",
      fulfillmentStatus: "ORDERING",
      paidAmount: 0,
      pendingAmount: 100,
      requiredAmount: "100.00",
      payments: [],
      ...overrides,
    });
    const lockState = (payments: unknown[] = []) => {
      tx.order.findUniqueOrThrow.mockResolvedValue({
        paymentStatus: "PENDING_PAYMENT",
        fulfillmentStatus: "ORDERING",
        status: "ACTIVE",
        requiredAmount: new Prisma.Decimal("100.00"),
        currency: "PEN",
      });
      tx.orderPayment.findMany.mockResolvedValue(payments);
    };
    const add = (
      overrides: {
        amount?: unknown;
        method?: unknown;
        operationCode?: unknown;
        paidAt?: unknown;
        confirmDuplicate?: unknown;
        file?: unknown;
        note?: string;
      } = {},
    ) =>
      controller.addPayment(
        storeId,
        orderId,
        session,
        (overrides.amount ?? "40") as string,
        (overrides.method ?? "YAPE") as string,
        overrides.note,
        ("file" in overrides ? overrides.file : CAPTURE) as never,
        overrides.operationCode,
        overrides.paidAt,
        overrides.confirmDuplicate,
      );

    beforeEach(() => {
      orders.findRowByIdForStore
        .mockResolvedValueOnce(pendingOrder())
        .mockResolvedValue(fullOrderFixture);
      lockState();
    });

    it("persists operationCode (normalized for storage), paidAt and recordedBy, and keeps the code out of events and audit", async () => {
      await add({
        operationCode: "  ＡＢ-12 ",
        paidAt: "2026-10-01T17:00:00.000Z",
        note: "a\nb",
      });
      expect(tx.orderPayment.create.mock.calls[0]![0].data).toMatchObject({
        operationCode: "AB-12",
        paidAt: new Date("2026-10-01T17:00:00.000Z"),
        recordedBy: userId,
        note: "a b",
        method: "YAPE",
      });
      const emitted = JSON.stringify([
        events.record.mock.calls,
        tx.auditLog.create.mock.calls,
      ]);
      expect(emitted).not.toMatch(/AB-12|operationCode/);
      expect(events.record.mock.calls[0]![1].payload).toEqual({
        amount: 40,
        method: "YAPE",
      });
    });

    it("looks up duplicates by the authenticated store, excluding the current order", async () => {
      await add({ operationCode: "OP-1" });
      expect(paymentsService.findDuplicateOperationCode).toHaveBeenCalledWith(
        storeId,
        "OP-1",
        { currentOrderId: orderId },
      );
    });

    it("answers 409 with the duplicate order id and writes and uploads nothing", async () => {
      paymentsService.findDuplicateOperationCode.mockResolvedValue({
        orderId: "other-order",
      });
      const error = await add({ operationCode: "OP-1" }).catch((e) => e);
      expect(error).toBeInstanceOf(DuplicateOperationCodeException);
      expect(error.getStatus()).toBe(409);
      expect(error.orderId).toBe("other-order");
      expect(storage.uploadPaymentImage).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.orderPayment.create).not.toHaveBeenCalled();
    });

    it("confirmDuplicate=true skips the lookup and records the payment", async () => {
      paymentsService.findDuplicateOperationCode.mockResolvedValue({
        orderId: "other-order",
      });
      await add({ operationCode: "OP-1", confirmDuplicate: "true" });
      expect(paymentsService.findDuplicateOperationCode).not.toHaveBeenCalled();
      expect(tx.orderPayment.create).toHaveBeenCalledTimes(1);
    });

    it("does not look up a payment without an operation code", async () => {
      await add({});
      expect(paymentsService.findDuplicateOperationCode).not.toHaveBeenCalled();
    });

    it("requires a capture unless the method is CASH", async () => {
      await expect(add({ file: undefined })).rejects.toThrow("captura");
      expect(prisma.$transaction).not.toHaveBeenCalled();
      await add({ file: undefined, method: "CASH" });
      expect(tx.orderPayment.create).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["a date-only value", "2026-10-01"],
      ["a value without an offset", "2026-10-01T10:00:00"],
      ["an impossible date", "2026-13-45T10:00:00Z"],
      ["text", "yesterday"],
      ["an array", ["2026-10-01T10:00:00Z"]],
    ])("rejects paidAt as %s", async (_n, paidAt) => {
      await expect(add({ paidAt })).rejects.toThrow("Fecha de pago");
      expect(tx.orderPayment.create).not.toHaveBeenCalled();
    });

    it("rejects a future paidAt beyond the 5-minute skew", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-28T12:00:00.000Z"));
      try {
        await expect(
          add({ paidAt: "2026-10-28T12:06:00.000Z" }),
        ).rejects.toThrow("futura");
        await add({ paidAt: "2026-10-28T12:04:00.000Z" });
        expect(tx.orderPayment.create).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("defaults paidAt to now when omitted", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-28T12:00:00.000Z"));
      try {
        await add({});
        expect(tx.orderPayment.create.mock.calls[0]![0].data.paidAt).toEqual(
          new Date("2026-10-28T12:00:00.000Z"),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      ["NUL", "AB\u0000C"],
      ["a newline", "AB\nC"],
      ["too long", "A".repeat(65)],
      ["symbols only", "---"],
      ["non-string", 42],
    ])("rejects an operation code that is %s", async (_n, operationCode) => {
      await expect(add({ operationCode })).rejects.toThrow(
        "Código de operación",
      );
      expect(paymentsService.findDuplicateOperationCode).not.toHaveBeenCalled();
    });

    it.each(["1e2", "0x10", "0.001", "0", "-1", "1,5", "100."])(
      "rejects the amount %j",
      async (amount) => {
        await expect(add({ amount })).rejects.toThrow("Monto inválido");
      },
    );

    it("cannot exceed pending minus buyer proofs waiting for review", async () => {
      orders.findRowByIdForStore.mockReset();
      orders.findRowByIdForStore.mockResolvedValueOnce(
        pendingOrder({
          payments: [
            {
              amount: new Prisma.Decimal("80.00"),
              source: "BUYER_SUBMITTED",
              reviewStatus: "PENDING_REVIEW",
              voidedAt: null,
            },
          ],
        }),
      );
      await expect(add({ amount: "30" })).rejects.toThrow(
        "Rechaza o valida el comprobante pendiente",
      );
      expect(storage.uploadPaymentImage).not.toHaveBeenCalled();
    });

    it("ignores voided pending proofs when reserving", async () => {
      orders.findRowByIdForStore.mockReset();
      orders.findRowByIdForStore
        .mockResolvedValueOnce(
          pendingOrder({
            payments: [
              {
                amount: new Prisma.Decimal("80.00"),
                source: "BUYER_SUBMITTED",
                reviewStatus: "PENDING_REVIEW",
                voidedAt: new Date(),
              },
            ],
          }),
        )
        .mockResolvedValue(fullOrderFixture);
      await add({ amount: "100" });
      expect(tx.orderPayment.create).toHaveBeenCalledTimes(1);
    });

    it("re-applies the reserved limit under the lock when a proof arrived meanwhile", async () => {
      storage.uploadPaymentImage.mockResolvedValue("https://cdn.example/c.png");
      lockState([
        {
          amount: new Prisma.Decimal("80.00"),
          source: "BUYER_SUBMITTED",
          reviewStatus: "PENDING_REVIEW",
          voidedAt: null,
        },
      ]);
      await expect(add({ amount: "30" })).rejects.toThrow(
        "Rechaza o valida el comprobante pendiente",
      );
      expect(tx.orderPayment.create).not.toHaveBeenCalled();
      // The capture was already uploaded: it must not stay orphaned.
      expect(storage.deleteImage).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["cancelled", { paymentStatus: "CANCELLED" }, "cancelada"],
      ["rejected", { paymentStatus: "REJECTED" }, "rechazada"],
      ["shipped", { fulfillmentStatus: "IN_TRANSIT" }, "enviada"],
    ])(
      "re-checks the state under the lock: %s meanwhile",
      async (_n, change, message) => {
        tx.order.findUniqueOrThrow.mockResolvedValue({
          paymentStatus: "PENDING_PAYMENT",
          fulfillmentStatus: "ORDERING",
          status: "ACTIVE",
          requiredAmount: new Prisma.Decimal("100.00"),
          currency: "PEN",
          ...change,
        });
        await expect(add()).rejects.toThrow(message);
        expect(tx.orderPayment.create).not.toHaveBeenCalled();
      },
    );

    it("rethrows HTTP exceptions from the transaction unwrapped and wraps only unexpected errors", async () => {
      tx.orderPayment.create.mockRejectedValueOnce(
        new NotFoundException("Orden no encontrada"),
      );
      await expect(add()).rejects.toBeInstanceOf(NotFoundException);

      tx.orderPayment.create.mockRejectedValueOnce(new Error("db exploded"));
      await expect(add()).rejects.toBeInstanceOf(BadRequestException);
    });

    it("checks ownership before reading the order", async () => {
      orders.assertOwnership.mockRejectedValueOnce(new Error("forbidden"));
      await expect(add()).rejects.toThrow("forbidden");
      expect(orders.findRowByIdForStore).not.toHaveBeenCalled();
    });
  });
});

describe("OrderController.getPaymentImage", () => {
  let controller: OrderController;
  let orders: {
    assertOwnership: Mock;
    findPaymentForStore: Mock;
  };
  let storage: { getPaymentImageStream: Mock };

  const storeId = "store-1";
  const orderId = "order-1";
  const paymentId = "payment-1";
  const userId = "user-1";
  const session = { user: { id: userId } } as any;

  beforeEach(async () => {
    orders = {
      assertOwnership: vi.fn(),
      findPaymentForStore: vi.fn(),
    };
    storage = { getPaymentImageStream: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderRepository, useValue: orders },
        { provide: ReviewPaymentUseCase, useValue: { execute: vi.fn() } },
        { provide: AdvanceFulfillmentUseCase, useValue: { execute: vi.fn() } },
        { provide: CancelOrderUseCase, useValue: { execute: vi.fn() } },
        { provide: VoidOrderPaymentUseCase, useValue: { execute: vi.fn() } },
        {
          provide: OrderPaymentsService,
          useValue: {
            findDuplicateOperationCode: vi.fn().mockResolvedValue(null),
          },
        },
        { provide: PrismaService, useValue: {} },
        { provide: StorageService, useValue: storage },
        { provide: OrderEventsService, useValue: { record: vi.fn() } },
      ],
    }).compile();

    controller = module.get(OrderController);
  });

  it("checks ownership before touching the payment or storage", async () => {
    orders.assertOwnership.mockRejectedValueOnce(new Error("not owner"));

    await expect(
      controller.getPaymentImage(storeId, orderId, paymentId, session),
    ).rejects.toThrow("not owner");

    expect(orders.findPaymentForStore).not.toHaveBeenCalled();
    expect(storage.getPaymentImageStream).not.toHaveBeenCalled();
  });

  it("404s when the payment has no image instead of streaming anything", async () => {
    orders.findPaymentForStore.mockResolvedValueOnce({
      id: paymentId,
      orderId,
      storeId,
      imageUrl: null,
    });

    await expect(
      controller.getPaymentImage(storeId, orderId, paymentId, session),
    ).rejects.toThrow(NotFoundException);

    expect(storage.getPaymentImageStream).not.toHaveBeenCalled();
  });

  it("streams the stored image with its content type once ownership and the payment both check out", async () => {
    orders.findPaymentForStore.mockResolvedValueOnce({
      id: paymentId,
      orderId,
      storeId,
      imageUrl: "https://cdn.biasmarket.com/payments/payments/abc.jpg",
    });
    const body = { pipe: vi.fn() } as any;
    storage.getPaymentImageStream.mockResolvedValueOnce({
      body,
      contentType: "image/jpeg",
    });

    const result = await controller.getPaymentImage(
      storeId,
      orderId,
      paymentId,
      session,
    );

    expect(orders.assertOwnership).toHaveBeenCalledWith(storeId, userId);
    expect(orders.findPaymentForStore).toHaveBeenCalledWith(
      paymentId,
      orderId,
      storeId,
    );
    expect(storage.getPaymentImageStream).toHaveBeenCalledWith(
      "https://cdn.biasmarket.com/payments/payments/abc.jpg",
    );
    expect(result.getStream()).toBe(body);
    expect(result.getHeaders().type).toBe("image/jpeg");
  });
});

describe("OrderController.shipping", () => {
  let controller: OrderController;
  let orders: { assertOwnership: Mock; findRowByIdForStore: Mock };
  let storage: {
    uploadPaymentImage: Mock;
    getPaymentImageStream: Mock;
    deleteImage: Mock;
  };
  let events: { record: Mock };
  let tx: {
    $queryRaw: Mock;
    order: { findFirst: Mock; updateMany: Mock };
    auditLog: { create: Mock };
  };
  let prisma: { $transaction: Mock };

  const storeId = "store-1";
  const orderId = "order-1";
  const userId = "user-1";
  const session = { user: { id: userId } } as any;
  const orderFixture = {
    id: orderId,
    storeId,
    customerId: null,
    buyerAccountId: null,
    customerEmail: null,
    customerPhone: "+51999999999",
    customerName: null,
    source: "MARKETPLACE",
    deliveryMethodType: "COURIER",
    deliveryDetails: {},
    pickupPointId: null,
    pickupDate: null,
    courierName: null,
    courierModality: null,
    trackingNumber: null,
    trackingUrl: null,
    packedPhotoUrl: null,
    paymentMethod: null,
    paymentStatus: "PARTIALLY_PAID",
    paymentRejectionReason: null,
    fulfillmentStatus: "ORDERING",
    status: "ACTIVE",
    cancellationResolution: null,
    cancellationReason: null,
    retainedAmount: null,
    releasedAmount: null,
    releasedResolution: null,
    totalAmount: { toString: () => "100.00" },
    requiredAmount: { toString: () => "100.00" },
    currency: "PEN",
    expiresAt: new Date("2026-08-10T00:00:00.000Z"),
    createdAt: new Date("2026-08-05T00:00:00.000Z"),
    paidAmount: 40,
    pendingAmount: 60,
    paidPercentage: 40,
    linkFirstOpenedAt: null,
    claimedAt: null,
    buyerConfirmedReceivedAt: null,
    createdBy: null,
    items: [],
    payments: [],
  };

  beforeEach(async () => {
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      order: {
        findFirst: vi.fn().mockResolvedValue({
          trackingNumber: null,
          trackingUrl: null,
          source: "MARKETPLACE",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn((cb: (transaction: unknown) => unknown) => cb(tx)),
    };
    orders = {
      assertOwnership: vi.fn(),
      findRowByIdForStore: vi.fn().mockResolvedValue(orderFixture),
    };
    storage = {
      uploadPaymentImage: vi.fn().mockResolvedValue("private/packed/photo.jpg"),
      getPaymentImageStream: vi.fn(),
      deleteImage: vi.fn().mockResolvedValue(undefined),
    };
    events = { record: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderRepository, useValue: orders },
        { provide: ReviewPaymentUseCase, useValue: { execute: vi.fn() } },
        { provide: AdvanceFulfillmentUseCase, useValue: { execute: vi.fn() } },
        { provide: CancelOrderUseCase, useValue: { execute: vi.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: OrderEventsService, useValue: events },
        { provide: VoidOrderPaymentUseCase, useValue: { execute: vi.fn() } },
        {
          provide: OrderPaymentsService,
          useValue: {
            findDuplicateOperationCode: vi.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    controller = module.get(OrderController);
  });

  it("rejects tracking edits before reading or updating an order without store ownership", async () => {
    orders.assertOwnership.mockRejectedValueOnce(new Error("not owner"));

    await expect(
      controller.updateShipping(storeId, orderId, session, {
        trackingNumber: "TRK-1",
      } as any),
    ).rejects.toThrow("not owner");

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("stores tracking details and records TRACKING_ADDED only when a number is added", async () => {
    const result = await controller.updateShipping(storeId, orderId, session, {
      trackingNumber: "TRK-1",
      trackingUrl: "https://track.example/TRK-1",
    } as any);

    expect(orders.assertOwnership).toHaveBeenCalledWith(storeId, userId);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.order.findFirst.mock.invocationCallOrder[0]!,
    );
    expect(tx.order.findFirst).toHaveBeenCalledWith({
      where: { id: orderId, storeId },
      select: { trackingNumber: true, trackingUrl: true, source: true },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: orderId, storeId },
      data: {
        trackingNumber: "TRK-1",
        trackingUrl: "https://track.example/TRK-1",
      },
    });
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: "TRACKING_ADDED",
      actor: "SELLER",
    });
    expect(result).not.toHaveProperty("packedPhotoUrl");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("audits assisted tracking changes with the seller actor and no tracking data", async () => {
    tx.order.findFirst.mockResolvedValueOnce({
      trackingNumber: null,
      trackingUrl: null,
      source: "VENDOR_ASSISTED",
    });

    await controller.updateShipping(storeId, orderId, session, {
      trackingNumber: "TRK-SECRET-1",
      trackingUrl: "https://track.example/TRK-SECRET-1",
    } as any);

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: userId,
        storeId,
        action: "order.tracking_updated",
        entityType: "Order",
        entityId: orderId,
        metadata: {},
      },
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      "TRK-SECRET-1",
    );
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      "track.example",
    );
  });

  it.each([
    [
      "clearing the tracking number",
      { trackingNumber: "TRK-OLD", trackingUrl: "https://old.example/x" },
      { trackingNumber: null },
    ],
    [
      "changing only the tracking URL",
      { trackingNumber: "TRK-OLD", trackingUrl: "https://old.example/x" },
      { trackingUrl: "https://new.example/private" },
    ],
  ])(
    "audits assisted tracking details when %s",
    async (_label, before, dto) => {
      tx.order.findFirst.mockResolvedValueOnce({
        ...before,
        source: "VENDOR_ASSISTED",
      });

      await controller.updateShipping(storeId, orderId, session, dto as any);

      expect(events.record).not.toHaveBeenCalled();
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: userId,
          storeId,
          action: "order.tracking_updated",
          entityType: "Order",
          entityId: orderId,
          metadata: {},
        },
      });
      expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toMatch(
        /TRK-OLD|old\.example|new\.example|private/,
      );
    },
  );

  it("does not audit an unchanged assisted tracking value", async () => {
    tx.order.findFirst.mockResolvedValueOnce({
      trackingNumber: "TRK-1",
      trackingUrl: "https://track.example/TRK-1",
      source: "VENDOR_ASSISTED",
    });

    await controller.updateShipping(storeId, orderId, session, {
      trackingNumber: "TRK-1",
      trackingUrl: "https://track.example/TRK-1",
    } as any);

    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(events.record).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("requires ownership before package-photo storage and records PACKED_PHOTO_ADDED", async () => {
    orders.assertOwnership.mockRejectedValueOnce(new Error("not owner"));
    await expect(
      controller.uploadPackedPhoto(storeId, orderId, session, {
        buffer: Buffer.from("jpeg"),
        detectedMimeType: "image/jpeg",
      } as any),
    ).rejects.toThrow("not owner");
    expect(storage.uploadPaymentImage).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();

    orders.assertOwnership.mockResolvedValueOnce(undefined);
    const result = await controller.uploadPackedPhoto(
      storeId,
      orderId,
      session,
      { buffer: Buffer.from("jpeg"), detectedMimeType: "image/jpeg" } as any,
    );

    expect(storage.uploadPaymentImage).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/jpeg",
    );
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: "PACKED_PHOTO_ADDED",
      actor: "SELLER",
    });
    expect(result).not.toHaveProperty("packedPhotoUrl");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("audits assisted package photos without persisting the photo URL or contents", async () => {
    tx.order.findFirst.mockResolvedValueOnce({ source: "VENDOR_ASSISTED" });

    await controller.uploadPackedPhoto(storeId, orderId, session, {
      buffer: Buffer.from("private-photo-contents"),
      detectedMimeType: "image/jpeg",
    } as any);

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: userId,
        storeId,
        action: "order.packed_photo_added",
        entityType: "Order",
        entityId: orderId,
        metadata: {},
      },
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      "private/packed/photo.jpg",
    );
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      "private-photo-contents",
    );
  });

  it("deletes an uploaded photo if the order transaction fails and preserves the transaction error", async () => {
    tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
    storage.deleteImage.mockRejectedValueOnce(new Error("storage offline"));

    await expect(
      controller.uploadPackedPhoto(storeId, orderId, session, {
        buffer: Buffer.from("photo"),
        detectedMimeType: "image/jpeg",
      } as any),
    ).rejects.toMatchObject({ message: "Orden no encontrada" });

    expect(storage.deleteImage).toHaveBeenCalledWith(
      "private/packed/photo.jpg",
    );
    expect(events.record).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("OrderController.reviewPaymentProof", () => {
  let controller: OrderController;
  let orders: {
    assertOwnership: Mock;
    findPaymentForStore: Mock;
    findRowByIdForStore: Mock;
    saveStatus: Mock;
  };
  let reviewPayment: { execute: Mock };
  let events: { record: Mock };
  let prisma: { $transaction: Mock };
  let tx: {
    $queryRaw: Mock;
    order: { findUniqueOrThrow: Mock };
    orderPayment: { updateMany: Mock; findMany: Mock };
    auditLog: { create: Mock };
  };

  const storeId = "store-1";
  const orderId = "order-1";
  const paymentId = "payment-1";
  const userId = "user-1";
  const session = { user: { id: userId } } as any;

  const detailFixture = {
    id: orderId,
    storeId,
    deliveryDetails: null,
    pickupDate: null,
    retainedAmount: null,
    releasedAmount: null,
    releasedResolution: null,
    totalAmount: { toString: () => "100.00" },
    requiredAmount: { toString: () => "100.00" },
    expiresAt: new Date("2026-08-10T00:00:00.000Z"),
    createdAt: new Date("2026-08-05T00:00:00.000Z"),
    items: [],
    payments: [],
  };

  beforeEach(async () => {
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      order: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          paymentStatus: "PENDING_PAYMENT",
          requiredAmount: new Prisma.Decimal("100.00"),
        }),
      },
      orderPayment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      auditLog: { create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    orders = {
      assertOwnership: vi.fn(),
      findPaymentForStore: vi.fn().mockResolvedValue({
        id: paymentId,
        orderId,
        storeId,
        source: "BUYER_SUBMITTED",
        reviewStatus: "PENDING_REVIEW",
        amount: new Prisma.Decimal("40.00"),
      }),
      findRowByIdForStore: vi.fn().mockResolvedValue(detailFixture),
      saveStatus: vi.fn(),
    };
    reviewPayment = { execute: vi.fn() };
    events = { record: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderRepository, useValue: orders },
        { provide: ReviewPaymentUseCase, useValue: reviewPayment },
        { provide: AdvanceFulfillmentUseCase, useValue: { execute: vi.fn() } },
        { provide: CancelOrderUseCase, useValue: { execute: vi.fn() } },
        { provide: VoidOrderPaymentUseCase, useValue: { execute: vi.fn() } },
        {
          provide: OrderPaymentsService,
          useValue: {
            findDuplicateOperationCode: vi.fn().mockResolvedValue(null),
          },
        },
        { provide: PrismaService, useValue: prisma },
        {
          provide: StorageService,
          useValue: {
            uploadPaymentImage: vi.fn(),
            getPaymentImageStream: vi.fn(),
          },
        },
        { provide: OrderEventsService, useValue: events },
      ],
    }).compile();

    controller = module.get(OrderController);
  });

  it("writes PARTIALLY_PAID inside the review transaction and records one PAYMENT_VALIDATED with the paymentId", async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({
      paymentStatus: "PENDING_PAYMENT",
      requiredAmount: new Prisma.Decimal("100.00"),
    });
    tx.orderPayment.findMany.mockResolvedValue([
      {
        amount: new Prisma.Decimal("40.00"),
        source: "BUYER_SUBMITTED",
        reviewStatus: "APPROVED",
      },
    ]);

    await controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
      decision: "approve",
    });

    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: "PAYMENT_VALIDATED",
      actor: "SELLER",
      payload: { paymentId },
    });
    expect(orders.saveStatus).toHaveBeenCalledWith(
      orderId,
      { paymentStatus: "PARTIALLY_PAID" },
      tx,
    );
    expect(reviewPayment.execute).not.toHaveBeenCalled();
  });

  it("lets ReviewPaymentUseCase settle a proof that clears the balance without a second PAYMENT_VALIDATED", async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({
      paymentStatus: "PARTIALLY_PAID",
      requiredAmount: new Prisma.Decimal("100.00"),
    });
    const seller60 = {
      amount: new Prisma.Decimal("60.00"),
      source: "SELLER_RECORDED",
      reviewStatus: "N_A",
    };
    // First read (under the lock, before the claim): only the 60 is credited.
    // Second read (after the claim): the proof now counts too.
    tx.orderPayment.findMany
      .mockResolvedValueOnce([seller60])
      .mockResolvedValueOnce([
        seller60,
        {
          amount: new Prisma.Decimal("40.00"),
          source: "BUYER_SUBMITTED",
          reviewStatus: "APPROVED",
        },
      ]);

    await controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
      decision: "approve",
    });

    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: "PAYMENT_VALIDATED",
        payload: { paymentId },
      }),
    );
    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).toHaveBeenCalledWith(
      orderId,
      storeId,
      userId,
      "approve",
      undefined,
      { recordEvent: false },
    );
  });

  it("records PAYMENT_REJECTED and leaves the order status alone when the proof is rejected", async () => {
    await controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
      decision: "reject",
      reason: "Comprobante ilegible",
    });

    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: "PAYMENT_REJECTED",
      actor: "SELLER",
      payload: { paymentId },
    });
    expect(tx.orderPayment.findMany).not.toHaveBeenCalled();
    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).not.toHaveBeenCalled();
  });

  it("locks the order row before reading the paid total", async () => {
    tx.orderPayment.findMany.mockResolvedValue([]);
    const order: string[] = [];
    tx.$queryRaw.mockImplementation(async () => {
      order.push("lock");
      return [{ id: orderId }];
    });
    tx.orderPayment.findMany.mockImplementation(async () => {
      order.push("read");
      return [];
    });

    await controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
      decision: "approve",
    });

    // The lock comes before every read of the paid total.
    expect(order[0]).toBe("lock");
    expect(order).toContain("read");
  });

  it("rejects a proof another request already reviewed and records no event", async () => {
    tx.orderPayment.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
        decision: "approve",
      }),
    ).rejects.toThrow("Este comprobante ya fue revisado");

    expect(events.record).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("marks a REJECTED decision on a cancelled order reviewed without a buyer-visible event", async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({
      paymentStatus: "CANCELLED",
      requiredAmount: new Prisma.Decimal("100.00"),
    });

    await controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
      decision: "reject",
    });

    expect(tx.orderPayment.updateMany).toHaveBeenCalled();
    expect(events.record).not.toHaveBeenCalled();
    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).not.toHaveBeenCalled();
  });

  it.each(["CANCELLED", "REJECTED"])(
    "refuses to APPROVE a proof of a %s order and leaves it pending",
    async (paymentStatus) => {
      tx.order.findUniqueOrThrow.mockResolvedValue({
        paymentStatus,
        requiredAmount: new Prisma.Decimal("100.00"),
      });

      await expect(
        controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
          decision: "approve",
        }),
      ).rejects.toThrow("No se puede aprobar");

      // The guard runs before the claim: nothing was written.
      expect(tx.orderPayment.updateMany).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(events.record).not.toHaveBeenCalled();
    },
  );

  it("refuses to approve a proof that exceeds the remaining balance", async () => {
    // 40 proof, 100 required, 70 already credited: only 30 left.
    tx.orderPayment.findMany.mockResolvedValue([
      {
        amount: new Prisma.Decimal("70.00"),
        source: "SELLER_RECORDED",
        reviewStatus: "N_A",
        voidedAt: null,
      },
    ]);

    await expect(
      controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
        decision: "approve",
      }),
    ).rejects.toThrow("excede el saldo pendiente");
    expect(tx.orderPayment.updateMany).not.toHaveBeenCalled();
    expect(events.record).not.toHaveBeenCalled();
  });

  it("approves a proof that fits exactly in the remaining balance", async () => {
    const credited = {
      amount: new Prisma.Decimal("60.00"),
      source: "SELLER_RECORDED",
      reviewStatus: "N_A",
      voidedAt: null,
    };
    tx.orderPayment.findMany
      .mockResolvedValueOnce([credited])
      .mockResolvedValueOnce([
        credited,
        {
          amount: new Prisma.Decimal("40.00"),
          source: "BUYER_SUBMITTED",
          reviewStatus: "APPROVED",
          voidedAt: null,
        },
      ]);

    await controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
      decision: "approve",
    });

    expect(tx.orderPayment.updateMany).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: "PAYMENT_VALIDATED" }),
    );
  });

  it("404s when the order is not in the store (lock finds nothing)", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
        decision: "approve",
      }),
    ).rejects.toThrow("Orden no encontrada");
    expect(tx.orderPayment.updateMany).not.toHaveBeenCalled();
  });

  it("stores only a sanitized reason in the audit log, never the code, note or image", async () => {
    await controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
      decision: "reject",
      reason: "\u202eMala\ncaptura",
    });
    const audit = tx.auditLog.create.mock.calls[0]![0].data;
    expect(audit.metadata).toEqual({ reason: "Mala captura" });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toMatch(/operationCode|imageUrl|note/);
  });

  it("refuses a proof that was not submitted by the buyer", async () => {
    orders.findPaymentForStore.mockResolvedValueOnce({
      id: paymentId,
      orderId,
      storeId,
      source: "SELLER_RECORDED",
      reviewStatus: "PENDING_REVIEW",
    });

    await expect(
      controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
        decision: "approve",
      }),
    ).rejects.toThrow(
      "Solo se pueden revisar comprobantes enviados por el comprador",
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("pickPublicOrderFields", () => {
  it("copies the public order fields and drops everything else", () => {
    const row = {
      id: "order-1",
      storeId: "store-1",
      customerPhone: "+51987654321",
      source: "VENDOR_ASSISTED",
      // The buyer's account id is internal: sellers get the order, not who the
      // buyer's account is (#379).
      buyerAccountId: "buyer-secret-id",
      accessTokenHash: "hash",
      accessTokenRevokedAt: new Date(),
      linkFirstOpenedAt: new Date(),
      claimedAt: new Date(),
      phoneVerified: true,
      createdByUserId: "seller-1",
      customerPhoneNormalized: "+51987654321",
      secretFutureColumn: "leak",
    };

    expect(pickPublicOrderFields(row)).toEqual({
      id: "order-1",
      storeId: "store-1",
      customerPhone: "+51987654321",
      source: "VENDOR_ASSISTED",
    });
  });
});
