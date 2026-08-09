import { Test, type TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { CollectionsService } from "./collections.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("CollectionsService", () => {
  let service: CollectionsService;
  let prisma: {
    store: { findUnique: Mock };
    product: { findUnique: Mock };
    collection: {
      findUnique: Mock;
      findMany: Mock;
      create: Mock;
      update: Mock;
      delete: Mock;
    };
    collectionProduct: {
      count: Mock;
      findMany: Mock;
      upsert: Mock;
      delete: Mock;
      updateMany: Mock;
    };
    $transaction: Mock;
  };

  const ownerId = "user-1";
  const storeId = "store-1";
  const collectionId = "collection-1";
  const productId = "product-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      product: { findUnique: vi.fn() },
      collection: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      collectionProduct: {
        count: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn((fn) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CollectionsService>(CollectionsService);
  });

  describe("ownership checks", () => {
    it("throws NotFoundException when the store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.findAllForStore(storeId, ownerId),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException when the user does not own the store", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: storeId,
        ownerId: "someone-else",
      });

      await expect(
        service.findAllForStore(storeId, ownerId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("create()", () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it("slugifies the name and creates the collection", async () => {
      prisma.collection.findUnique.mockResolvedValue(null);
      prisma.collection.create.mockResolvedValue({ id: collectionId });

      await service.create(storeId, ownerId, { name: "New Drop!" });

      expect(prisma.collection.create).toHaveBeenCalledWith({
        data: { name: "New Drop!", description: "", slug: "new-drop", storeId },
      });
    });

    it("throws ConflictException when the slug is already taken in the store", async () => {
      prisma.collection.findUnique.mockResolvedValue({ id: "existing" });

      await expect(
        service.create(storeId, ownerId, { name: "New Drop" }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("addProduct()", () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.collection.findUnique.mockResolvedValue({
        id: collectionId,
        storeId,
      });
    });

    it("throws NotFoundException when the product does not belong to the store", async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId: "other-store",
      });

      await expect(
        service.addProduct(collectionId, storeId, ownerId, { productId }),
      ).rejects.toThrow(NotFoundException);
    });

    it("appends the product at the current product count when no position is given", async () => {
      prisma.product.findUnique.mockResolvedValue({ id: productId, storeId });
      prisma.collectionProduct.count.mockResolvedValue(2);
      prisma.collectionProduct.upsert.mockResolvedValue({});

      await service.addProduct(collectionId, storeId, ownerId, { productId });

      expect(prisma.collectionProduct.upsert).toHaveBeenCalledWith({
        where: { collectionId_productId: { collectionId, productId } },
        create: { collectionId, productId, position: 2 },
        update: { position: 2 },
      });
    });
  });

  describe("reorderProducts()", () => {
    it("rewrites the position of every product in the given order", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.collection.findUnique.mockResolvedValue({
        id: collectionId,
        storeId,
      });
      prisma.collectionProduct.updateMany.mockResolvedValue({ count: 1 });
      prisma.collectionProduct.findMany.mockResolvedValue([{ id: "cp-1" }]);

      const result = await service.reorderProducts(
        collectionId,
        storeId,
        ownerId,
        { productIds: ["p-2", "p-1"] },
      );

      expect(prisma.collectionProduct.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          collectionId,
          collection: { storeId },
          product: { storeId },
          productId: "p-2",
        },
        data: { position: 0 },
      });
      expect(prisma.collectionProduct.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          collectionId,
          collection: { storeId },
          product: { storeId },
          productId: "p-1",
        },
        data: { position: 1 },
      });
      expect(prisma.collectionProduct.findMany).toHaveBeenCalledWith({
        where: {
          collectionId,
          collection: { storeId },
          product: { storeId },
          productId: { in: ["p-2", "p-1"] },
        },
        orderBy: { position: "asc" },
      });
      expect(result).toEqual([{ id: "cp-1" }]);
    });

    it("throws BadRequestException for a cross-store or non-member productId", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.collection.findUnique.mockResolvedValue({
        id: collectionId,
        storeId,
      });
      // A productId whose product belongs to another store (or that isn't in
      // this collection) makes the storeId-scoped updateMany predicate match
      // nothing → count 0 → 400. This is the DB-boundary scoping working, not
      // just the preflight findOwnedCollection guard.
      prisma.collectionProduct.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reorderProducts(collectionId, storeId, ownerId, {
          productIds: ["foreign-product"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("scopes both write predicates to the store through the collection and product relations", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.collection.findUnique.mockResolvedValue({
        id: collectionId,
        storeId,
      });
      prisma.collectionProduct.updateMany.mockResolvedValue({ count: 1 });
      prisma.collectionProduct.findMany.mockResolvedValue([]);

      await service.reorderProducts(collectionId, storeId, ownerId, {
        productIds: ["p-1"],
      });

      expect(prisma.collectionProduct.updateMany).toHaveBeenCalledWith({
        where: {
          collectionId,
          collection: { storeId },
          product: { storeId },
          productId: "p-1",
        },
        data: { position: 0 },
      });
      expect(prisma.collectionProduct.findMany).toHaveBeenCalledWith({
        where: {
          collectionId,
          collection: { storeId },
          product: { storeId },
          productId: { in: ["p-1"] },
        },
        orderBy: { position: "asc" },
      });
    });
  });
});
