import { Test, type TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { StoresService } from "./stores.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("StoresService", () => {
  let service: StoresService;
  let prisma: {
    store: {
      findUnique: Mock;
      create: Mock;
      findMany: Mock;
      update: Mock;
      count: Mock;
    };
    deliveryMethodConfig: { create: Mock };
    paymentMethodConfig: { createMany: Mock };
    storeSection: { findMany: Mock };
    product: { findMany: Mock; findUnique: Mock };
    order: { findMany: Mock };
    $transaction: Mock;
  };

  const ownerId = "user-1";

  beforeEach(async () => {
    prisma = {
      store: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      deliveryMethodConfig: { create: vi.fn() },
      paymentMethodConfig: { createMany: vi.fn() },
      storeSection: { findMany: vi.fn() },
      product: { findMany: vi.fn(), findUnique: vi.fn() },
      order: { findMany: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StoresService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<StoresService>(StoresService);
  });

  const createDto = {
    name: "My Store",
    slug: "my-store",
    whatsappNumber: "+51999999999",
  };

  it("rejects reserved slugs without touching the database", async () => {
    await expect(
      service.create(ownerId, { ...createDto, slug: "admin" }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.store.create).not.toHaveBeenCalled();
  });

  it("rejects a slug that already exists", async () => {
    prisma.store.findUnique.mockResolvedValue({ id: "existing-store" });

    await expect(service.create(ownerId, createDto)).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.store.create).not.toHaveBeenCalled();
  });

  it("creates the store with a slugified slug, whatsappNumber, and a default PICKUP delivery method", async () => {
    prisma.store.findUnique.mockResolvedValue(null);
    prisma.store.create.mockResolvedValue({ id: "store-1" });

    await service.create(ownerId, {
      name: "My Cool Store!",
      slug: "My Cool Store!",
      whatsappNumber: "+51999999999",
    });

    expect(prisma.store.findUnique).toHaveBeenCalledWith({
      where: { slug: "my-cool-store" },
    });
    expect(prisma.store.create).toHaveBeenCalledWith({
      data: {
        name: "My Cool Store!",
        slug: "my-cool-store",
        ownerId,
        themeConfig: {},
        paymentInstructions: "",
        whatsappNumber: "+51999999999",
      },
    });
    expect(prisma.deliveryMethodConfig.create).toHaveBeenCalledWith({
      data: { storeId: "store-1", type: "PICKUP", enabled: true, details: {} },
    });
  });

  it("persists a provided themeConfig during creation", async () => {
    prisma.store.findUnique.mockResolvedValue(null);
    prisma.store.create.mockResolvedValue({ id: "store-2" });

    await service.create(ownerId, {
      ...createDto,
      themeConfig: {
        paletteId: "royal-bloom",
        colors: { primary: "#7c3aed", accent: "#f472b6" },
      },
    });

    expect(prisma.store.create).toHaveBeenCalledWith({
      data: {
        name: "My Store",
        slug: "my-store",
        ownerId,
        themeConfig: {
          paletteId: "royal-bloom",
          colors: { primary: "#7c3aed", accent: "#f472b6" },
        },
        paymentInstructions: "",
        whatsappNumber: "+51999999999",
      },
    });
  });

  it("findAllForUser() lists stores scoped to the owner", async () => {
    prisma.store.findMany.mockResolvedValue([]);

    await service.findAllForUser(ownerId);

    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: { ownerId },
    });
  });

  describe("findBySlugForOwner()", () => {
    it("throws NotFoundException when no store has that slug", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.findBySlugForOwner("missing", ownerId)).rejects
        .toThrow(
          NotFoundException,
        );
    });

    it("throws ForbiddenException when the user does not own the store", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        ownerId: "someone-else",
      });

      await expect(service.findBySlugForOwner("my-store", ownerId)).rejects
        .toThrow(
          ForbiddenException,
        );
    });

    it("returns the store when the user owns it", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        slug: "my-store",
        ownerId,
      });

      const result = await service.findBySlugForOwner("my-store", ownerId);

      expect(result).toEqual({ id: "store-1", slug: "my-store", ownerId });
    });
  });

  describe("update()", () => {
    it("throws NotFoundException when the store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.update("store-1", ownerId, { whatsappNumber: "+51999999999" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException when the user does not own the store", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        ownerId: "someone-else",
      });

      await expect(
        service.update("store-1", ownerId, { whatsappNumber: "+51999999999" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("updates whatsappNumber when the user owns the store", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: "store-1", ownerId });
      prisma.store.update.mockResolvedValue({ id: "store-1" });

      await service.update("store-1", ownerId, {
        whatsappNumber: "+51999999999",
      });

      expect(prisma.store.update).toHaveBeenCalledWith({
        where: { id: "store-1" },
        data: { whatsappNumber: "+51999999999" },
      });
    });

    it("updates themeConfig when the user changes the palette", async () => {
      prisma.store.findUnique.mockResolvedValue({ id: "store-1", ownerId });
      prisma.store.update.mockResolvedValue({ id: "store-1" });

      await service.update("store-1", ownerId, {
        themeConfig: {
          paletteId: "mint-stage",
          colors: { primary: "#0f766e", accent: "#22c55e" },
        },
      });

      expect(prisma.store.update).toHaveBeenCalledWith({
        where: { id: "store-1" },
        data: {
          themeConfig: {
            paletteId: "mint-stage",
            colors: { primary: "#0f766e", accent: "#22c55e" },
          },
        },
      });
    });
  });

  describe("findPublicBySlug()", () => {
    const storeId = "store-1";
    const productA = { id: "product-a", status: "PUBLISHED", deletedAt: null };
    const productB = { id: "product-b", status: "PUBLISHED", deletedAt: null };

    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({
        id: storeId,
        slug: "my-store",
      });
    });

    it("throws NotFoundException when no store has that slug", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.findPublicBySlug("missing")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("lists every published product directly when the store has no sections configured", async () => {
      prisma.storeSection.findMany.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([productA, productB]);

      const result = await service.findPublicBySlug("my-store");

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          storeId,
          status: "PUBLISHED",
          deletedAt: null,
          id: { notIn: [] },
        },
        include: { variants: true },
      });
      expect(result.sections).toHaveLength(1);
      const productIds = result.sections[0].collection?.products.map((
        cp: { productId: string },
      ) => cp.productId);
      expect(productIds).toEqual([productA.id, productB.id]);
    });

    it("appends a trailing catch-all section for a published product never added to a collection", async () => {
      prisma.storeSection.findMany.mockResolvedValue([
        {
          id: "section-1",
          storeId,
          position: 0,
          collection: {
            id: "collection-1",
            name: "Destacados",
            products: [{
              collectionId: "collection-1",
              productId: productA.id,
              position: 0,
              product: productA,
            }],
          },
        },
      ]);
      prisma.product.findMany.mockResolvedValue([productB]);

      const result = await service.findPublicBySlug("my-store");

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          storeId,
          status: "PUBLISHED",
          deletedAt: null,
          id: { notIn: [productA.id] },
        },
        include: { variants: true },
      });
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].collection?.name).toBe("Destacados");
      expect(
        result.sections[1].collection?.products.map((
          cp: { productId: string },
        ) => cp.productId),
      ).toEqual([
        productB.id,
      ]);
    });

    it("does not append a trailing section when every published product is already covered", async () => {
      prisma.storeSection.findMany.mockResolvedValue([
        {
          id: "section-1",
          storeId,
          position: 0,
          collection: {
            id: "collection-1",
            name: "Destacados",
            products: [{
              collectionId: "collection-1",
              productId: productA.id,
              position: 0,
              product: productA,
            }],
          },
        },
      ]);
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.findPublicBySlug("my-store");

      expect(result.sections).toHaveLength(1);
    });

    it("excludes DRAFT and soft-deleted products from a real collection section", async () => {
      const draftProduct = {
        id: "product-draft",
        status: "DRAFT",
        deletedAt: null,
      };
      const deletedProduct = {
        id: "product-deleted",
        status: "PUBLISHED",
        deletedAt: new Date(),
      };
      prisma.storeSection.findMany.mockResolvedValue([
        {
          id: "section-1",
          storeId,
          position: 0,
          collection: {
            id: "collection-1",
            name: "Destacados",
            products: [
              {
                collectionId: "collection-1",
                productId: productA.id,
                position: 0,
                product: productA,
              },
              {
                collectionId: "collection-1",
                productId: draftProduct.id,
                position: 1,
                product: draftProduct,
              },
              {
                collectionId: "collection-1",
                productId: deletedProduct.id,
                position: 2,
                product: deletedProduct,
              },
            ],
          },
        },
      ]);
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.findPublicBySlug("my-store");

      expect(
        result.sections[0].collection?.products.map((
          cp: { productId: string },
        ) => cp.productId),
      ).toEqual([
        productA.id,
      ]);
    });
  });

  describe("findFeatured", () => {
    it("excludes stores below the minimum order-count floor", async () => {
      prisma.store.findMany.mockResolvedValue([
        { id: "store-1", name: "A", slug: "a", logoUrl: null },
      ]);
      prisma.order.findMany.mockResolvedValue([
        { storeId: "store-1", payments: [{ amount: 500 }] },
        { storeId: "store-1", payments: [{ amount: 200 }] },
      ]);

      const result = await service.findFeatured(10);

      expect(result).toEqual([]);
    });

    it("ranks eligible stores by revenue, tie-broken by order count", async () => {
      prisma.store.findMany.mockResolvedValue([
        { id: "store-1", name: "A", slug: "a", logoUrl: null },
        { id: "store-2", name: "B", slug: "b", logoUrl: null },
      ]);
      prisma.order.findMany.mockResolvedValue([
        { storeId: "store-1", payments: [{ amount: 50 }] },
        { storeId: "store-1", payments: [{ amount: 50 }] },
        { storeId: "store-1", payments: [{ amount: 50 }] },
        { storeId: "store-2", payments: [{ amount: 100 }] },
        { storeId: "store-2", payments: [{ amount: 100 }] },
        { storeId: "store-2", payments: [{ amount: 100 }] },
      ]);

      const result = await service.findFeatured(10);

      expect(result.map((s) => s.id)).toEqual(["store-2", "store-1"]);
      expect(result[0].revenue).toBe(300);
      expect(result[0].orderCount).toBe(3);
    });

    it("scopes eligibility to stores with a published product and a non-banned owner", async () => {
      prisma.store.findMany.mockResolvedValue([]);
      prisma.order.findMany.mockResolvedValue([]);

      await service.findFeatured(10);

      expect(prisma.store.findMany).toHaveBeenCalledWith({
        where: {
          isPublic: true,
          products: { some: { status: "PUBLISHED", deletedAt: null } },
          owner: { banned: { not: true } },
        },
        select: { id: true, name: true, slug: true, logoUrl: true },
      });
    });
  });

  describe("findDirectory", () => {
    it("paginates and filters by name when q is provided", async () => {
      prisma.store.findMany.mockResolvedValue([{
        id: "store-1",
        name: "Kpop Shop",
        slug: "kpop",
        logoUrl: null,
      }]);
      prisma.store.count.mockResolvedValue(1);

      const result = await service.findDirectory(2, 24, "kpop");

      expect(prisma.store.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: "kpop", mode: "insensitive" },
          }),
          skip: 24,
          take: 24,
        }),
      );
      expect(result).toEqual({
        stores: [{
          id: "store-1",
          name: "Kpop Shop",
          slug: "kpop",
          logoUrl: null,
        }],
        total: 1,
        page: 2,
        limit: 24,
      });
    });

    it("omits the name filter when q is not provided", async () => {
      prisma.store.findMany.mockResolvedValue([]);
      prisma.store.count.mockResolvedValue(0);

      await service.findDirectory(1, 24, undefined);

      expect(prisma.store.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isPublic: true,
            products: { some: { status: "PUBLISHED", deletedAt: null } },
            owner: { banned: { not: true } },
          },
        }),
      );
    });
  });

  describe("findPublicProduct", () => {
    it("throws NotFoundException when the store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);
      await expect(service.findPublicProduct("missing", "product-1")).rejects
        .toThrow(
          NotFoundException,
        );
    });

    it("throws NotFoundException when the product belongs to a different store", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        slug: "my-store",
        name: "My Store",
        logoUrl: null,
      });
      prisma.product.findUnique.mockResolvedValue({
        id: "product-1",
        storeId: "other-store",
        status: "PUBLISHED",
        deletedAt: null,
      });

      await expect(service.findPublicProduct("my-store", "product-1")).rejects
        .toThrow(
          NotFoundException,
        );
    });

    it("throws NotFoundException for a DRAFT or soft-deleted product", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        slug: "my-store",
        name: "My Store",
        logoUrl: null,
      });
      prisma.product.findUnique.mockResolvedValue({
        id: "product-1",
        storeId: "store-1",
        status: "DRAFT",
        deletedAt: null,
      });

      await expect(service.findPublicProduct("my-store", "product-1")).rejects
        .toThrow(
          NotFoundException,
        );
    });

    it("returns the store summary and product for a published, owned product", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        slug: "my-store",
        name: "My Store",
        logoUrl: null,
      });
      prisma.product.findUnique.mockResolvedValue({
        id: "product-1",
        storeId: "store-1",
        status: "PUBLISHED",
        deletedAt: null,
        name: "Album",
        variants: [],
      });

      const result = await service.findPublicProduct("my-store", "product-1");

      expect(result).toEqual({
        store: { name: "My Store", slug: "my-store", logoUrl: null },
        product: expect.objectContaining({ id: "product-1", name: "Album" }),
      });
    });
  });
});
