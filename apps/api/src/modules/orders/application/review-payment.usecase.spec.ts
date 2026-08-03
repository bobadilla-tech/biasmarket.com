import { Test, TestingModule } from "@nestjs/testing";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { ReviewPaymentUseCase } from "./review-payment.usecase.js";
import { OrderRepository } from "../infrastructure/order.repository.js";
import { InvalidOrderTransitionError } from "../domain/order-status.vo.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { MailerService } from "../../../mailer/mailer.service.js";

describe("ReviewPaymentUseCase", () => {
  let useCase: ReviewPaymentUseCase;
  let prisma: {
    store: { findUnique: Mock };
    order: { findUnique: Mock; updateMany: Mock; findUniqueOrThrow: Mock };
    productVariant: { findUnique: Mock; update: Mock };
    product: { findUnique: Mock };
    auditLog: { create: Mock };
    $transaction: Mock;
  };
  let notifications: { syncStockAlerts: Mock };
  let mailer: {
    send: Mock<
      (
        params: { to: string; subject: string; html: string },
      ) => Promise<{ id: string }>
    >;
  };

  const ownerId = "user-1";
  const storeId = "store-1";
  const orderId = "order-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      order: {
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn(),
      },
      productVariant: { findUnique: vi.fn(), update: vi.fn() },
      product: { findUnique: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    notifications = { syncStockAlerts: vi.fn() };
    mailer = { send: vi.fn().mockResolvedValue({ id: "email-1" }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewPaymentUseCase,
        OrderRepository,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();

    useCase = module.get(ReviewPaymentUseCase);

    prisma.store.findUnique.mockResolvedValue({
      id: storeId,
      ownerId,
      name: "My Store",
    });
  });

  it("throws ForbiddenException when the user does not own the store", async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: storeId,
      ownerId: "someone-else",
    });

    await expect(useCase.execute(orderId, storeId, ownerId, "approve")).rejects
      .toThrow(
        ForbiddenException,
      );
  });

  it("throws NotFoundException when the order belongs to a different store", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId: "other-store",
      items: [],
    });

    await expect(useCase.execute(orderId, storeId, ownerId, "approve")).rejects
      .toThrow(
        NotFoundException,
      );
  });

  it("approve() decrements reserved and stock for finite-stock variants and writes an audit log", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: "PENDING_PAYMENT",
      fulfillmentStatus: "ORDERING",
      items: [{ variantId: "variant-1", productId: "product-1", quantity: 2 }],
    });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: "variant-1",
      stock: 10,
      reserved: 2,
    });
    prisma.productVariant.update.mockResolvedValue({
      id: "variant-1",
      stock: 8,
      reserved: 0,
    });
    prisma.product.findUnique.mockResolvedValue({
      id: "product-1",
      name: "Widget",
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: orderId,
      paymentStatus: "VERIFIED",
    });

    await useCase.execute(orderId, storeId, ownerId, "approve");

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: "variant-1" },
      data: { reserved: { decrement: 2 }, stock: { decrement: 2 } },
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: orderId, paymentStatus: "PENDING_PAYMENT" },
      data: { paymentStatus: "VERIFIED", paymentRejectionReason: null },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: ownerId,
        storeId,
        action: "payment.approved",
        entityType: "Order",
        entityId: orderId,
        metadata: {},
      },
    });
    expect(notifications.syncStockAlerts).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ id: storeId }),
      expect.objectContaining({ id: "product-1" }),
      expect.objectContaining({ id: "variant-1" }),
    );
  });

  it("reject() releases reserved stock without touching real stock", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: "PENDING_PAYMENT",
      fulfillmentStatus: "ORDERING",
      items: [{ variantId: "variant-1", quantity: 3 }],
    });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: "variant-1",
      stock: 10,
      reserved: 3,
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: orderId,
      paymentStatus: "REJECTED",
    });

    await useCase.execute(orderId, storeId, ownerId, "reject");

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: "variant-1" },
      data: { reserved: { decrement: 3 } },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "payment.rejected" }),
      }),
    );
  });

  it("skips stock adjustment for items with unlimited (null) stock variants", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: "PENDING_PAYMENT",
      fulfillmentStatus: "ORDERING",
      items: [{ variantId: "variant-1", quantity: 1 }],
    });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: "variant-1",
      stock: null,
      reserved: 0,
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: orderId,
      paymentStatus: "VERIFIED",
    });

    await useCase.execute(orderId, storeId, ownerId, "approve");

    expect(prisma.productVariant.update).not.toHaveBeenCalled();
  });

  it("throws ConflictException when the order was already reviewed by a concurrent request", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: "PENDING_PAYMENT",
      fulfillmentStatus: "ORDERING",
      customerEmail: "buyer@example.com",
      items: [{ variantId: "variant-1", productId: "product-1", quantity: 1 }],
    });
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(useCase.execute(orderId, storeId, ownerId, "approve")).rejects
      .toThrow(
        ConflictException,
      );

    expect(prisma.productVariant.update).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("sends an approval email to the customer with the store name", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: "PENDING_PAYMENT",
      fulfillmentStatus: "ORDERING",
      customerEmail: "buyer@example.com",
      items: [],
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: orderId,
      paymentStatus: "VERIFIED",
    });

    await useCase.execute(orderId, storeId, ownerId, "approve");

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "buyer@example.com",
        subject: expect.stringContaining("Pago aprobado"),
        html: expect.stringContaining("My Store"),
      }),
    );
  });

  it("sends a rejection email to the customer and never throws on mailer failure", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: "PENDING_PAYMENT",
      fulfillmentStatus: "ORDERING",
      customerEmail: "buyer@example.com",
      items: [],
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: orderId,
      paymentStatus: "REJECTED",
    });
    mailer.send.mockRejectedValue(new Error("resend down"));

    const result = await useCase.execute(orderId, storeId, ownerId, "reject");

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "buyer@example.com",
        subject: expect.stringContaining("Pago rechazado"),
      }),
    );
    expect(result).toEqual({ id: orderId, paymentStatus: "REJECTED" });
  });

  it("persists the rejection reason on the order when rejecting with a reason", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: "PENDING_PAYMENT",
      fulfillmentStatus: "ORDERING",
      items: [],
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: orderId,
      paymentStatus: "REJECTED",
    });

    await useCase.execute(
      orderId,
      storeId,
      ownerId,
      "reject",
      "Comprobante adulterado",
    );

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: orderId, paymentStatus: "PENDING_PAYMENT" },
      data: {
        paymentStatus: "REJECTED",
        paymentRejectionReason: "Comprobante adulterado",
      },
    });
  });

  it("includes the escaped rejection reason in the buyer email", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: "PENDING_PAYMENT",
      fulfillmentStatus: "ORDERING",
      customerEmail: "buyer@example.com",
      items: [],
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: orderId,
      paymentStatus: "REJECTED",
    });

    await useCase.execute(
      orderId,
      storeId,
      ownerId,
      "reject",
      "<script>alert(1)</script>",
    );

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("&lt;script&gt;alert(1)&lt;/script&gt;"),
      }),
    );
  });

  it("rejects approving an already-VERIFIED order", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: "VERIFIED",
      fulfillmentStatus: "ORDERING",
      items: [],
    });

    await expect(useCase.execute(orderId, storeId, ownerId, "approve")).rejects
      .toThrow(
        InvalidOrderTransitionError,
      );
  });
});
