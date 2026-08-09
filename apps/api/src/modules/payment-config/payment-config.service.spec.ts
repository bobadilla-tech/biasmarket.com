import { Test, type TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { PaymentConfigService } from "./payment-config.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { StorageService } from "../../storage/storage.service.js";

describe("PaymentConfigService", () => {
  let service: PaymentConfigService;
  let prisma: {
    store: { findUnique: Mock };
    paymentMethodConfig: { findMany: Mock; upsert: Mock; findUnique: Mock };
  };
  let storage: {
    uploadPaymentQrImage: Mock;
    deleteImage: Mock;
  };

  const ownerId = "user-1";
  const storeId = "store-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      paymentMethodConfig: {
        findMany: vi.fn(),
        upsert: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    storage = {
      uploadPaymentQrImage: vi.fn(),
      deleteImage: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get<PaymentConfigService>(PaymentConfigService);
  });

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

  describe("findEnabledForStore", () => {
    it("only returns enabled methods", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.paymentMethodConfig.findMany.mockResolvedValue([{
        method: "YAPE",
        enabled: true,
      }]);

      const result = await service.findEnabledForStore(storeId, ownerId);

      expect(prisma.paymentMethodConfig.findMany).toHaveBeenCalledWith({
        where: { storeId, enabled: true },
      });
      expect(result).toEqual([{ method: "YAPE", enabled: true }]);
    });
  });

  describe("upsert", () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it("creates a new method config with details defaulted to {}", async () => {
      prisma.paymentMethodConfig.upsert.mockResolvedValue({});

      await service.upsert(storeId, ownerId, { method: "YAPE", enabled: true });

      expect(prisma.paymentMethodConfig.upsert).toHaveBeenCalledWith({
        where: { storeId_method: { storeId, method: "YAPE" } },
        create: { storeId, method: "YAPE", enabled: true, details: {} },
        update: { enabled: true },
      });
    });

    it("defaults enabled to true when omitted on create", async () => {
      prisma.paymentMethodConfig.upsert.mockResolvedValue({});

      await service.upsert(storeId, ownerId, { method: "CASH" });

      expect(prisma.paymentMethodConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { storeId, method: "CASH", enabled: true, details: {} },
        }),
      );
    });

    it("toggles enabled on an existing method without touching details", async () => {
      prisma.paymentMethodConfig.upsert.mockResolvedValue({});

      await service.upsert(storeId, ownerId, {
        method: "PLIN",
        enabled: false,
      });

      expect(prisma.paymentMethodConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { enabled: false } }),
      );
    });

    it("persists TRANSFER details when all required fields are present", async () => {
      prisma.paymentMethodConfig.upsert.mockResolvedValue({});

      await service.upsert(storeId, ownerId, {
        method: "TRANSFER",
        details: {
          bankName: "BCP",
          accountNumber: "123456789",
          accountHolder: "Store Owner",
        },
      });

      expect(prisma.paymentMethodConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            details: {
              bankName: "BCP",
              accountNumber: "123456789",
              accountHolder: "Store Owner",
            },
          }),
          update: expect.objectContaining({
            details: {
              bankName: "BCP",
              accountNumber: "123456789",
              accountHolder: "Store Owner",
            },
          }),
        }),
      );
    });

    it("rejects TRANSFER details missing a required field", async () => {
      await expect(
        service.upsert(storeId, ownerId, {
          method: "TRANSFER",
          details: { bankName: "BCP" },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.paymentMethodConfig.upsert).not.toHaveBeenCalled();
    });

    it("persists YAPE details when all required fields are present", async () => {
      prisma.paymentMethodConfig.upsert.mockResolvedValue({});

      await service.upsert(storeId, ownerId, {
        method: "YAPE",
        details: { phoneNumber: "+51999999999", accountHolder: "Store Owner" },
      });

      expect(prisma.paymentMethodConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            details: {
              phoneNumber: "+51999999999",
              accountHolder: "Store Owner",
            },
          }),
        }),
      );
    });

    it("rejects YAPE/PLIN details missing a required field", async () => {
      await expect(
        service.upsert(storeId, ownerId, {
          method: "PLIN",
          details: { phoneNumber: "+51999999999" },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("drops any submitted details for CASH", async () => {
      prisma.paymentMethodConfig.upsert.mockResolvedValue({});

      await service.upsert(storeId, ownerId, {
        method: "CASH",
        details: { bankName: "should be ignored" },
      });

      expect(prisma.paymentMethodConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ details: {} }),
          update: expect.objectContaining({ details: {} }),
        }),
      );
    });
  });

  describe("uploadQrImage", () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it("rejects TRANSFER/CASH — no QR concept for those methods", async () => {
      await expect(
        service.uploadQrImage(
          storeId,
          ownerId,
          "TRANSFER",
          Buffer.from("x"),
          "image/png",
        ),
      ).rejects.toThrow(BadRequestException);
      expect(storage.uploadPaymentQrImage).not.toHaveBeenCalled();
    });

    it("uploads and merges qrImageUrl into existing details for YAPE", async () => {
      prisma.paymentMethodConfig.findUnique.mockResolvedValue({
        details: { phoneNumber: "+51999999999", accountHolder: "Owner" },
      });
      storage.uploadPaymentQrImage.mockResolvedValue(
        "https://cdn.test/payment-qr/new.png",
      );
      prisma.paymentMethodConfig.upsert.mockResolvedValue({});

      await service.uploadQrImage(
        storeId,
        ownerId,
        "YAPE",
        Buffer.from("x"),
        "image/png",
      );

      expect(prisma.paymentMethodConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            details: {
              phoneNumber: "+51999999999",
              accountHolder: "Owner",
              qrImageUrl: "https://cdn.test/payment-qr/new.png",
            },
          },
        }),
      );
      expect(storage.deleteImage).not.toHaveBeenCalled();
    });

    it("deletes the previous QR object when replacing an existing one", async () => {
      prisma.paymentMethodConfig.findUnique.mockResolvedValue({
        details: {
          phoneNumber: "+51999999999",
          accountHolder: "Owner",
          qrImageUrl: "https://cdn.test/payment-qr/old.png",
        },
      });
      storage.uploadPaymentQrImage.mockResolvedValue(
        "https://cdn.test/payment-qr/new.png",
      );
      prisma.paymentMethodConfig.upsert.mockResolvedValue({});

      await service.uploadQrImage(
        storeId,
        ownerId,
        "PLIN",
        Buffer.from("x"),
        "image/png",
      );

      expect(storage.deleteImage).toHaveBeenCalledWith(
        "https://cdn.test/payment-qr/old.png",
      );
    });
  });
});
