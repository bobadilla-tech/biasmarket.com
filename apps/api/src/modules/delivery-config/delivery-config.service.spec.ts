import { Test, type TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { DeliveryConfigService } from "./delivery-config.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("DeliveryConfigService", () => {
  let service: DeliveryConfigService;
  let prisma: {
    store: { findUnique: Mock };
    deliveryMethodConfig: { findMany: Mock; upsert: Mock; delete: Mock };
  };

  const ownerId = "user-1";
  const storeId = "store-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      deliveryMethodConfig: {
        findMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DeliveryConfigService>(DeliveryConfigService);
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

  describe("findAllForStore", () => {
    it("returns the store's delivery methods", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.deliveryMethodConfig.findMany.mockResolvedValue([
        { type: "PICKUP", enabled: true },
      ]);

      const result = await service.findAllForStore(storeId, ownerId);

      expect(prisma.deliveryMethodConfig.findMany).toHaveBeenCalledWith({
        where: { storeId },
      });
      expect(result).toEqual([{ type: "PICKUP", enabled: true }]);
    });
  });

  describe("upsert", () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it("creates a new method config with enabled defaulted to true and details to {}", async () => {
      prisma.deliveryMethodConfig.upsert.mockResolvedValue({});

      await service.upsert(storeId, ownerId, { type: "COURIER" });

      expect(prisma.deliveryMethodConfig.upsert).toHaveBeenCalledWith({
        where: { storeId_type: { storeId, type: "COURIER" } },
        create: { storeId, type: "COURIER", enabled: true, details: {} },
        update: {},
      });
    });

    it("passes explicit enabled and details through on create", async () => {
      prisma.deliveryMethodConfig.upsert.mockResolvedValue({});

      await service.upsert(storeId, ownerId, {
        type: "PICKUP",
        enabled: false,
        details: { pickupPointId: "pp-1" },
      });

      expect(prisma.deliveryMethodConfig.upsert).toHaveBeenCalledWith({
        where: { storeId_type: { storeId, type: "PICKUP" } },
        create: {
          storeId,
          type: "PICKUP",
          enabled: false,
          details: { pickupPointId: "pp-1" },
        },
        update: { enabled: false, details: { pickupPointId: "pp-1" } },
      });
    });

    it("toggles enabled on an existing method without touching details", async () => {
      prisma.deliveryMethodConfig.upsert.mockResolvedValue({});

      await service.upsert(storeId, ownerId, {
        type: "COURIER",
        enabled: false,
      });

      expect(prisma.deliveryMethodConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { enabled: false } }),
      );
    });

    it("merges details on an existing method without touching enabled", async () => {
      prisma.deliveryMethodConfig.upsert.mockResolvedValue({});

      await service.upsert(storeId, ownerId, {
        type: "PICKUP",
        details: { note: "leave at door" },
      });

      expect(prisma.deliveryMethodConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { details: { note: "leave at door" } },
        }),
      );
    });
  });

  describe("remove", () => {
    it("throws NotFoundException when the store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.remove(storeId, ownerId, "PICKUP")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("deletes the method config", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.deliveryMethodConfig.delete.mockResolvedValue({});

      await service.remove(storeId, ownerId, "PICKUP");

      expect(prisma.deliveryMethodConfig.delete).toHaveBeenCalledWith({
        where: { storeId_type: { storeId, type: "PICKUP" } },
      });
    });
  });

  describe("findEnabledForSlug", () => {
    it("throws NotFoundException when the slug does not resolve to a store", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.findEnabledForSlug("no-such-store"),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.deliveryMethodConfig.findMany).not.toHaveBeenCalled();
    });

    it("only returns enabled methods for the store resolved by the slug", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: storeId,
        slug: "my-store",
      });
      prisma.deliveryMethodConfig.findMany.mockResolvedValue([
        { type: "COURIER", enabled: true },
      ]);

      const result = await service.findEnabledForSlug("my-store");

      expect(prisma.store.findUnique).toHaveBeenCalledWith({
        where: { slug: "my-store" },
      });
      expect(prisma.deliveryMethodConfig.findMany).toHaveBeenCalledWith({
        where: { storeId, enabled: true },
      });
      expect(result).toEqual([{ type: "COURIER", enabled: true }]);
    });
  });
});
