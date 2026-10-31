import { Test, type TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { CategoriesService } from "./categories.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("CategoriesService", () => {
  let service: CategoriesService;
  let prisma: {
    store: { findUnique: Mock; update: Mock };
    category: {
      findUnique: Mock;
      findFirst: Mock;
      findMany: Mock;
      create: Mock;
      update: Mock;
      delete: Mock;
      count: Mock;
    };
    productCategory: { count: Mock };
    $transaction: Mock;
  };

  const ownerId = "user-1";
  const storeId = "store-1";
  const categoryId = "category-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn(), update: vi.fn() },
      category: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      productCategory: { count: vi.fn() },
      $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
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
      prisma.category.findMany.mockResolvedValue([]);
    });

    it("creates a top-level category when no parentId is given", async () => {
      prisma.category.create.mockResolvedValue({ id: categoryId });

      await service.create(storeId, ownerId, { name: "Photocards" });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          name: "Photocards",
          parentId: undefined,
          storeId,
          slug: "photocards",
        },
      });
    });

    it("creates a unique, accent-insensitive slug", async () => {
      prisma.category.findMany.mockResolvedValue([{ slug: "nino" }]);
      prisma.category.create.mockResolvedValue({ id: categoryId });
      await service.create(storeId, ownerId, { name: "Niño" });
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { name: "Niño", parentId: undefined, storeId, slug: "nino-2" },
      });
    });

    it("uses a fallback slug when the category name has no latin characters", async () => {
      prisma.category.create.mockResolvedValue({ id: categoryId });

      await service.create(storeId, ownerId, { name: "🎨" });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          name: "🎨",
          parentId: undefined,
          storeId,
          slug: "categoria",
        },
      });
    });

    it("increments the slug suffix until it finds an unused category slug", async () => {
      prisma.category.findMany.mockResolvedValue([
        { slug: "photocards" },
        { slug: "photocards-2" },
      ]);
      prisma.category.create.mockResolvedValue({ id: categoryId });

      await service.create(storeId, ownerId, { name: "Photocards" });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          name: "Photocards",
          parentId: undefined,
          storeId,
          slug: "photocards-3",
        },
      });
    });

    it("throws BadRequestException when parentId does not belong to the store", async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: "parent-1",
        storeId: "other-store",
      });

      await expect(
        service.create(storeId, ownerId, { name: "BTS", parentId: "parent-1" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("update()", () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.category.findUnique.mockResolvedValue({
        id: categoryId,
        storeId,
        parentId: null,
      });
    });

    it("throws BadRequestException when a category is set as its own parent", async () => {
      await expect(
        service.update(categoryId, storeId, ownerId, { parentId: categoryId }),
      ).rejects.toThrow(BadRequestException);
    });

    it("returns the product count and maps slug uniqueness races to conflict", async () => {
      prisma.category.update.mockResolvedValue({
        id: categoryId,
        _count: { products: 4 },
      });
      await service.update(categoryId, storeId, ownerId, { name: "Updated" });
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { _count: { select: { products: true } } },
        }),
      );
      expect(prisma.store.update).toHaveBeenCalledWith({
        where: { id: storeId },
        data: { contentStaleAt: expect.any(Date) },
      });

      prisma.category.update.mockRejectedValue({ code: "P2002" });
      await expect(
        service.update(categoryId, storeId, ownerId, { slug: "taken" }),
      ).rejects.toThrow(ConflictException);

      prisma.category.update.mockRejectedValue({
        code: "P2002",
        meta: {
          driverAdapterError: {
            cause: {
              constraint: "Category_storeId_parentId_name_key",
              fields: ["storeId", "parentId", "name"],
            },
          },
        },
      });
      await expect(
        service.update(categoryId, storeId, ownerId, { name: "Taken" }),
      ).rejects.toThrow("Ya existe una categoría con ese nombre");
    });

    it("updates the image, product count, and sitemap freshness atomically", async () => {
      const tx = {
        category: {
          update: vi.fn().mockResolvedValue({
            id: categoryId,
            _count: { products: 2 },
          }),
        },
        store: { update: vi.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation(
        (callback: (transaction: typeof tx) => unknown) => callback(tx),
      );

      await service.updateImage(categoryId, storeId, ownerId, null);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { _count: { select: { products: true } } },
        }),
      );
      expect(tx.store.update).toHaveBeenCalledWith({
        where: { id: storeId },
        data: { contentStaleAt: expect.any(Date) },
      });
    });
  });

  describe("delete()", () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.category.findUnique.mockResolvedValue({ id: categoryId, storeId });
    });

    it("throws ConflictException when the category has children", async () => {
      prisma.category.count.mockResolvedValue(1);
      prisma.productCategory.count.mockResolvedValue(0);

      await expect(
        service.delete(categoryId, storeId, ownerId),
      ).rejects.toThrow(ConflictException);
    });

    it("throws ConflictException when the category has assigned products", async () => {
      prisma.category.count.mockResolvedValue(0);
      prisma.productCategory.count.mockResolvedValue(1);

      await expect(
        service.delete(categoryId, storeId, ownerId),
      ).rejects.toThrow(ConflictException);
    });

    it("deletes the category when it has no children or products", async () => {
      prisma.category.count.mockResolvedValue(0);
      prisma.productCategory.count.mockResolvedValue(0);
      prisma.category.delete.mockResolvedValue({ id: categoryId });

      await service.delete(categoryId, storeId, ownerId);

      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: categoryId },
      });
    });
  });
});
