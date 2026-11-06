import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { HEADERS_METADATA } from "@nestjs/common/constants";
import { vi } from "vitest";
import {
  CheckoutController,
  toCheckoutOrderDto,
  type CheckoutOrderRow,
} from "./checkout.controller.js";
import type { CreateOrderUseCase } from "../application/create-order.usecase.js";
import type { PrismaService } from "../../../prisma/prisma.service.js";
import type { StorageService } from "../../../storage/storage.service.js";
import type { PaymentConfigService } from "../../payment-config/payment-config.service.js";

const ORDER = {
  id: "order-1",
  storeId: "store-1",
  customerId: null,
  buyerAccountId: null,
  customerEmail: null,
  customerPhone: "999888777",
  customerName: null,
  source: "MARKETPLACE",
  deliveryMethodType: "PICKUP",
  deliveryDetails: null,
  pickupPointId: null,
  pickupDate: null,
  courierName: null,
  courierModality: null,
  paymentMethod: "YAPE",
  paymentStatus: "PENDING_PAYMENT",
  paymentRejectionReason: null,
  fulfillmentStatus: "ORDERING",
  status: "ACTIVE",
  cancellationResolution: null,
  cancellationReason: null,
  retainedAmount: null,
  releasedAmount: null,
  releasedResolution: null,
  totalAmount: { toString: () => "12.00" },
  requiredAmount: { toString: () => "12.00" },
  currency: "PEN",
  expiresAt: new Date("2026-11-03T00:00:00.000Z"),
  createdAt: new Date("2026-11-02T00:00:00.000Z"),
  items: [],
} as unknown as CheckoutOrderRow;

const BODY = {
  deliveryMethodType: "PICKUP",
  paymentMethod: "YAPE",
  customerPhone: "999888777",
  items: [{ productId: "product-1", quantity: 1 }],
};
const KEY = "4f1c1aa6-aebb-4e8f-8de2-55d03c4a9c36";
const PROOF_URL = "https://images.example/proof.jpg";
const FILE = {
  buffer: Buffer.from("proof"),
  detectedMimeType: "image/jpeg",
} as never;
const REQUEST = { headers: {} } as never;

function setup() {
  const createOrder = {
    findCheckoutReplay: vi.fn().mockResolvedValue(null),
    execute: vi.fn(),
  };
  const prisma = {
    store: { findUnique: vi.fn().mockResolvedValue({ id: "store-1" }) },
    orderPayment: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const storage = {
    uploadPaymentImage: vi.fn().mockResolvedValue(PROOF_URL),
    deleteImage: vi.fn().mockResolvedValue(undefined),
  };
  const paymentConfig = {
    findEnabledForSlug: vi
      .fn()
      .mockResolvedValue([
        { method: "YAPE", details: { phoneNumber: "999888777" } },
      ]),
  };
  const controller = new CheckoutController(
    createOrder as unknown as CreateOrderUseCase,
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    paymentConfig as unknown as PaymentConfigService,
  );
  return { controller, createOrder, prisma, storage, paymentConfig };
}

describe("checkout controller proof cleanup", () => {
  it("marks public checkout responses as non-cacheable", () => {
    expect(
      Reflect.getMetadata(HEADERS_METADATA, CheckoutController.prototype.create),
    ).toContainEqual({ name: "Cache-Control", value: "no-store" });
  });

  it("returns an existing replay before requiring or uploading proof", async () => {
    const { controller, createOrder, storage, paymentConfig } = setup();
    createOrder.findCheckoutReplay.mockResolvedValue(ORDER);

    const result = await controller.create(
      "demo",
      BODY,
      undefined,
      REQUEST,
      KEY,
    );

    expect(result.order.id).toBe("order-1");
    expect(result.order.proofSubmitted).toBe(false);
    expect(createOrder.execute).not.toHaveBeenCalled();
    expect(storage.uploadPaymentImage).not.toHaveBeenCalled();
    expect(paymentConfig.findEnabledForSlug).not.toHaveBeenCalled();
  });

  it("does not report seller recorded images as buyer proof", () => {
    expect(
      toCheckoutOrderDto({
        ...ORDER,
        payments: [
          {
            source: "SELLER_RECORDED",
            imageUrl: "https://images.example/seller",
          },
        ],
      }).proofSubmitted,
    ).toBe(false);
  });

  it.each([
    ["400", new BadRequestException("bad input")],
    ["409", new HttpException("conflict", 409)],
  ])(
    "deletes an uploaded image directly for HTTP %s",
    async (_label, error) => {
      const { controller, createOrder, prisma, storage } = setup();
      createOrder.execute.mockRejectedValue(error);

      await expect(
        controller.create("demo", BODY, FILE, REQUEST, KEY),
      ).rejects.toBe(error);

      expect(storage.deleteImage).toHaveBeenCalledTimes(1);
      expect(storage.deleteImage).toHaveBeenCalledWith(PROOF_URL);
      expect(prisma.store.findUnique).not.toHaveBeenCalled();
      expect(prisma.orderPayment.findFirst).not.toHaveBeenCalled();
    },
  );

  it("deletes directly for an HTTP 499 and verifies ownership at HTTP 500", async () => {
    const clientError = setup();
    clientError.createOrder.execute.mockRejectedValue(
      new HttpException("closed", 499),
    );
    await expect(
      clientError.controller.create("demo", BODY, FILE, REQUEST, KEY),
    ).rejects.toBeDefined();
    expect(clientError.prisma.store.findUnique).not.toHaveBeenCalled();
    expect(clientError.storage.deleteImage).toHaveBeenCalledTimes(1);

    const serverError = setup();
    serverError.createOrder.execute.mockRejectedValue(
      new HttpException("failed", 500),
    );
    await expect(
      serverError.controller.create("demo", BODY, FILE, REQUEST, KEY),
    ).rejects.toBeDefined();
    expect(serverError.prisma.store.findUnique).toHaveBeenCalledWith({
      where: { slug: "demo" },
      select: { id: true },
    });
    expect(serverError.prisma.orderPayment.findFirst).toHaveBeenCalledWith({
      where: { storeId: "store-1", imageUrl: PROOF_URL },
      select: { id: true },
    });
    expect(serverError.storage.deleteImage).toHaveBeenCalledTimes(1);
  });

  it("preserves a referenced image and when ownership lookup fails", async () => {
    const referenced = setup();
    referenced.createOrder.execute.mockRejectedValue(new NotFoundException());
    // A 404 is safe to delete without a database lookup.
    await expect(
      referenced.controller.create("demo", BODY, FILE, REQUEST, KEY),
    ).rejects.toBeDefined();
    expect(referenced.storage.deleteImage).toHaveBeenCalledTimes(1);

    const unknownFailure = setup();
    unknownFailure.createOrder.execute.mockRejectedValue(new Error("unknown"));
    unknownFailure.prisma.orderPayment.findFirst.mockResolvedValue({
      id: "payment-1",
    });
    await expect(
      unknownFailure.controller.create("demo", BODY, FILE, REQUEST, KEY),
    ).rejects.toThrow("unknown");
    expect(unknownFailure.prisma.orderPayment.findFirst).toHaveBeenCalledWith({
      where: { storeId: "store-1", imageUrl: PROOF_URL },
      select: { id: true },
    });
    expect(unknownFailure.storage.deleteImage).not.toHaveBeenCalled();

    const lookupFails = setup();
    lookupFails.createOrder.execute.mockRejectedValue(new Error("unknown"));
    lookupFails.prisma.store.findUnique.mockRejectedValue(
      new Error("db unavailable"),
    );
    await expect(
      lookupFails.controller.create("demo", BODY, FILE, REQUEST, KEY),
    ).rejects.toThrow("unknown");
    expect(lookupFails.storage.deleteImage).not.toHaveBeenCalled();

    const paymentLookupFails = setup();
    const original = new Error("unknown");
    paymentLookupFails.createOrder.execute.mockRejectedValue(original);
    paymentLookupFails.prisma.orderPayment.findFirst.mockRejectedValue(
      new Error("payment lookup unavailable"),
    );
    await expect(
      paymentLookupFails.controller.create("demo", BODY, FILE, REQUEST, KEY),
    ).rejects.toBe(original);
    expect(
      paymentLookupFails.prisma.orderPayment.findFirst,
    ).toHaveBeenCalledWith({
      where: { storeId: "store-1", imageUrl: PROOF_URL },
      select: { id: true },
    });
    expect(paymentLookupFails.storage.deleteImage).not.toHaveBeenCalled();
  });

  it("keeps the original error when cleanup deletion fails", async () => {
    const { controller, createOrder, prisma, storage } = setup();
    const original = new HttpException("conflict", 409);
    createOrder.execute.mockRejectedValue(original);
    storage.deleteImage.mockRejectedValue(new Error("storage unavailable"));

    await expect(
      controller.create("demo", BODY, FILE, REQUEST, KEY),
    ).rejects.toBe(original);
    expect(prisma.store.findUnique).not.toHaveBeenCalled();
  });
});
