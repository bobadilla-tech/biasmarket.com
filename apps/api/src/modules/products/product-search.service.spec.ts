import { Test, TestingModule } from '@nestjs/testing';
import { vi, type Mock } from 'vitest';
import { ProductSearchService } from './product-search.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('ProductSearchService', () => {
  let service: ProductSearchService;
  let prisma: { product: { findMany: Mock; count: Mock } };

  beforeEach(async () => {
    prisma = { product: { findMany: vi.fn(), count: vi.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductSearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ProductSearchService);
  });

  it('filters to PUBLISHED, non-deleted products with a non-banned owner', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.search(1, 24, undefined);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          store: { owner: { banned: { not: true } } },
        },
      }),
    );
  });

  it('adds a case-insensitive name filter when q is provided', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.search(1, 24, 'photocard');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: { contains: 'photocard', mode: 'insensitive' } }),
      }),
    );
  });

  it('paginates using page/limit and returns the total count', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 'product-1' }]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.search(2, 10, undefined);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result).toEqual({ products: [{ id: 'product-1' }], total: 1, page: 2, limit: 10 });
  });
});
