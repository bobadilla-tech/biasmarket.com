import { Test, type TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { ProductSearchService } from "./product-search.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("ProductSearchService", () => {
  let service: ProductSearchService;
  let prisma: {
    product: { findMany: Mock; count: Mock };
    orderItem: { groupBy: Mock };
  };

  beforeEach(async () => {
    prisma = {
      product: { findMany: vi.fn(), count: vi.fn() },
      orderItem: { groupBy: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductSearchService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(ProductSearchService);
  });

  it("filters to PUBLISHED, non-deleted products with a non-banned owner", async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.search(1, 24, undefined, undefined, "latest");

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "PUBLISHED",
          deletedAt: null,
          discontinued: false,
          store: { owner: { banned: { not: true } } },
        },
      }),
    );
  });

  it("adds a case-insensitive name filter when q is provided", async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.search(1, 24, "photocard", undefined, "latest");

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: "photocard", mode: "insensitive" },
        }),
      }),
    );
  });

  it("adds a case-insensitive category filter when category is provided", async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.search(1, 24, undefined, "Photocards", "latest");

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categories: {
            some: {
              category: {
                name: { equals: "Photocards", mode: "insensitive" },
              },
            },
          },
        }),
      }),
    );
  });

  it("paginates using page/limit and returns the total count for latest", async () => {
    prisma.product.findMany.mockResolvedValue([{ id: "product-1" }]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.search(2, 10, undefined, undefined, "latest");

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result).toEqual({
      products: [{ id: "product-1" }],
      total: 1,
      page: 2,
      limit: 10,
    });
  });

  it("ranks bestsellers by verified units sold on the database", async () => {
    prisma.orderItem.groupBy.mockResolvedValue([
      { productId: "hot", _sum: { quantity: 5 } },
      { productId: "cold", _sum: { quantity: 2 } },
    ]);
    prisma.product.findMany.mockResolvedValue([{ id: "cold" }, { id: "hot" }]);
    prisma.product.count.mockResolvedValue(2);

    const result = await service.search(
      1,
      10,
      undefined,
      undefined,
      "bestseller",
    );

    expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["productId"],
        where: {
          product: {
            status: "PUBLISHED",
            deletedAt: null,
            discontinued: false,
            store: { owner: { banned: { not: true } } },
          },
          order: { paymentStatus: "VERIFIED" },
        },
        orderBy: [{ _sum: { quantity: "desc" } }, { productId: "asc" }],
        skip: 0,
        take: 10,
      }),
    );
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: {
        status: "PUBLISHED",
        deletedAt: null,
        discontinued: false,
        store: { owner: { banned: { not: true } } },
        orderItems: { some: { order: { paymentStatus: "VERIFIED" } } },
      },
    });
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(result.products).toEqual([{ id: "hot" }, { id: "cold" }]);
    expect(result.total).toBe(2);
  });

  it("pages bestsellers via the aggregation's skip/take", async () => {
    prisma.orderItem.groupBy.mockResolvedValue([
      { productId: "b", _sum: { quantity: 2 } },
    ]);
    prisma.product.findMany.mockResolvedValue([{ id: "b" }]);
    prisma.product.count.mockResolvedValue(3);

    const result = await service.search(
      2,
      1,
      undefined,
      undefined,
      "bestseller",
    );

    expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, take: 1 }),
    );
    expect(result.products).toEqual([{ id: "b" }]);
    expect(result.total).toBe(3);
  });

  it("breaks bestseller ties deterministically by productId across a page boundary", async () => {
    // Three products sold the same quantity; the tie-breaker orders by
    // productId asc, so page 2 (limit 2) returns the third product.
    prisma.orderItem.groupBy.mockResolvedValue([
      { productId: "p1", _sum: { quantity: 3 } },
      { productId: "p2", _sum: { quantity: 3 } },
      { productId: "p3", _sum: { quantity: 3 } },
    ]);
    prisma.product.findMany.mockResolvedValue([{ id: "p3" }]);
    prisma.product.count.mockResolvedValue(3);

    const result = await service.search(
      2,
      2,
      undefined,
      undefined,
      "bestseller",
    );

    expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ _sum: { quantity: "desc" } }, { productId: "asc" }],
        skip: 2,
        take: 2,
      }),
    );
    expect(result.products).toEqual([{ id: "p3" }]);
  });

  it("returns no bestsellers when no verified sales exist", async () => {
    prisma.orderItem.groupBy.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    const result = await service.search(
      1,
      10,
      undefined,
      undefined,
      "bestseller",
    );

    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
});
