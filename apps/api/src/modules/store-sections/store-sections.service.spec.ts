import { Test, type TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { StoreSectionsService } from "./store-sections.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("StoreSectionsService", () => {
  let service: StoreSectionsService;
  let prisma: {
    store: { findUnique: Mock };
    collection: { findUnique: Mock };
    storeSection: {
      findUnique: Mock;
      findMany: Mock;
      create: Mock;
      update: Mock;
      updateMany: Mock;
      delete: Mock;
      count: Mock;
    };
    $transaction: Mock;
  };

  const ownerId = "user-1";
  const storeId = "store-1";
  const sectionId = "section-1";
  const collectionId = "collection-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      collection: { findUnique: vi.fn() },
      storeSection: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn((fn) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreSectionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<StoreSectionsService>(StoreSectionsService);
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

  describe("create()", () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it("throws BadRequestException when type is COLLECTION but no collectionId is given", async () => {
      await expect(
        service.create(storeId, ownerId, { type: "COLLECTION" as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when the collection does not belong to the store", async () => {
      prisma.collection.findUnique.mockResolvedValue({
        id: collectionId,
        storeId: "other-store",
      });

      await expect(
        service.create(storeId, ownerId, {
          type: "COLLECTION" as any,
          collectionId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a BANNER section without requiring a collectionId", async () => {
      prisma.storeSection.count.mockResolvedValue(0);
      prisma.storeSection.create.mockResolvedValue({ id: sectionId });

      await service.create(storeId, ownerId, {
        type: "BANNER" as any,
        content: { imageUrl: "https://example.com/banner.png" },
      });

      expect(prisma.storeSection.create).toHaveBeenCalledWith({
        data: {
          storeId,
          type: "BANNER",
          collectionId: null,
          content: { imageUrl: "https://example.com/banner.png" },
          position: 0,
          hidden: false,
        },
      });
    });

    it("passes an explicit hidden flag through to the create payload", async () => {
      prisma.storeSection.count.mockResolvedValue(0);
      prisma.storeSection.create.mockResolvedValue({ id: sectionId });

      await service.create(storeId, ownerId, {
        type: "BANNER" as any,
        content: { imageUrl: "https://example.com/banner.png" },
        hidden: true,
      });

      expect(prisma.storeSection.create).toHaveBeenCalledWith({
        data: {
          storeId,
          type: "BANNER",
          collectionId: null,
          content: { imageUrl: "https://example.com/banner.png" },
          position: 0,
          hidden: true,
        },
      });
    });
  });

  describe("update()", () => {
    it("updates the hidden flag without requiring other fields", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.storeSection.findUnique.mockResolvedValue({
        id: sectionId,
        storeId,
        type: "BANNER",
        collectionId: null,
      });
      prisma.storeSection.update.mockResolvedValue({});

      await service.update(sectionId, storeId, ownerId, { hidden: true });

      expect(prisma.storeSection.update).toHaveBeenCalledWith({
        where: { id: sectionId },
        data: { hidden: true },
      });
    });
  });

  describe("reorder()", () => {
    it("rewrites the position of every section in the given order", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.storeSection.findMany.mockResolvedValueOnce([
        { id: "s-2" },
        { id: "s-1" },
      ]);
      prisma.storeSection.updateMany.mockResolvedValue({ count: 1 });
      prisma.storeSection.findMany.mockResolvedValueOnce([
        {
          id: "s-2",
          storeId,
          type: "BANNER",
          collectionId: null,
          content: {},
          position: 0,
          hidden: false,
          createdAt: new Date(),
        },
        {
          id: "s-1",
          storeId,
          type: "BANNER",
          collectionId: null,
          content: {},
          position: 1,
          hidden: false,
          createdAt: new Date(),
        },
      ]);

      const sections = await service.reorder(storeId, ownerId, {
        sectionIds: ["s-2", "s-1"],
      });

      expect(prisma.storeSection.findMany).toHaveBeenNthCalledWith(1, {
        where: { id: { in: ["s-2", "s-1"] }, storeId },
        select: { id: true },
      });
      expect(prisma.storeSection.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: "s-2", storeId },
        data: { position: 0 },
      });
      expect(prisma.storeSection.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: "s-1", storeId },
        data: { position: 1 },
      });
      expect(sections.map((s) => s.id)).toEqual(["s-2", "s-1"]);
    });

    it("throws BadRequestException when a sectionId does not belong to the store", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.storeSection.findMany.mockResolvedValue([{ id: "s-1" }]);

      await expect(
        service.reorder(storeId, ownerId, {
          sectionIds: ["s-1", "other-stores-section"],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.storeSection.updateMany).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when a tenant-scoped update affects no rows", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.storeSection.findMany.mockResolvedValue([{ id: "s-1" }]);
      prisma.storeSection.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reorder(storeId, ownerId, { sectionIds: ["s-1"] }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
