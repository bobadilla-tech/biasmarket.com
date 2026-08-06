import { Test, type TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { PaymentConfigService } from "./payment-config.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("PaymentConfigService", () => {
  let service: PaymentConfigService;
  let prisma: {
    store: { findUnique: Mock };
    paymentMethodConfig: { findMany: Mock; upsert: Mock };
  };

  const ownerId = "user-1";
  const storeId = "store-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      paymentMethodConfig: { findMany: vi.fn(), upsert: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentConfigService, {
        provide: PrismaService,
        useValue: prisma,
      }],
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
  });
});
