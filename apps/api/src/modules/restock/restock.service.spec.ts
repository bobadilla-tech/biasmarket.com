import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { RestockService } from './restock.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('RestockService', () => {
  let service: RestockService;
  let prisma: {
    store: { findUnique: Mock };
    product: { findUnique: Mock };
    productVariant: { findUnique: Mock };
    restockRequest: { create: Mock; findMany: Mock; count: Mock };
  };

  const store = { id: 'store-1', slug: 'myshop', ownerId: 'user-1' };
  const product = {
    id: 'product-1',
    storeId: 'store-1',
    status: 'PUBLISHED',
    deletedAt: null,
  };
  const variant = {
    id: 'variant-1',
    productId: 'product-1',
    storeId: 'store-1',
  };

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      product: { findUnique: vi.fn() },
      productVariant: { findUnique: vi.fn() },
      restockRequest: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RestockService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<RestockService>(RestockService);
  });

  describe('create()', () => {
    const dto = {
      name: 'Jane',
      phone: '+51999000111',
      productId: 'product-1',
      variantId: 'variant-1',
    };

    it('persists a request scoped to the resolved store', async () => {
      prisma.store.findUnique.mockResolvedValue(store);
      prisma.product.findUnique.mockResolvedValue(product);
      prisma.productVariant.findUnique.mockResolvedValue(variant);
      prisma.restockRequest.create.mockResolvedValue({ id: 'req-1' });

      const result = await service.create('myshop', dto);

      expect(prisma.store.findUnique).toHaveBeenCalledWith({
        where: { slug: 'myshop' },
      });
      expect(prisma.restockRequest.create).toHaveBeenCalledWith({
        data: {
          storeId: 'store-1',
          productId: 'product-1',
          variantId: 'variant-1',
          name: 'Jane',
          phone: '+51999000111',
        },
        select: { id: true, createdAt: true },
      });
      expect(result).toEqual({ id: 'req-1' });
    });

    it('throws NotFoundException when the store slug is unknown', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.create('nope', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the product is not published or not in the store', async () => {
      prisma.store.findUnique.mockResolvedValue(store);
      prisma.product.findUnique.mockResolvedValue({
        ...product,
        status: 'DRAFT',
      });

      await expect(service.create('myshop', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the variant does not belong to the product', async () => {
      prisma.store.findUnique.mockResolvedValue(store);
      prisma.product.findUnique.mockResolvedValue(product);
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'variant-1',
        productId: 'other-product',
        storeId: 'store-1',
      });

      await expect(service.create('myshop', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('persists a request without a variant when variantId is omitted', async () => {
      prisma.store.findUnique.mockResolvedValue(store);
      prisma.product.findUnique.mockResolvedValue(product);

      await service.create('myshop', {
        name: 'Jane',
        phone: '+51999000111',
        productId: 'product-1',
      });

      expect(prisma.productVariant.findUnique).not.toHaveBeenCalled();
      expect(prisma.restockRequest.create).toHaveBeenCalledWith({
        data: {
          storeId: 'store-1',
          productId: 'product-1',
          variantId: null,
          name: 'Jane',
          phone: '+51999000111',
        },
        select: { id: true, createdAt: true },
      });
    });
  });

  describe('listForStore()', () => {
    it('throws NotFoundException when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.listForStore('store-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the user is not the owner', async () => {
      prisma.store.findUnique.mockResolvedValue(store);

      await expect(service.listForStore('store-1', 'intruder')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lists requests newest first with product and variant names', async () => {
      prisma.store.findUnique.mockResolvedValue(store);
      prisma.restockRequest.findMany.mockResolvedValue([{ id: 'req-1' }]);

      const result = await service.listForStore('store-1', 'user-1');

      expect(prisma.restockRequest.findMany).toHaveBeenCalledWith({
        where: { storeId: 'store-1' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          createdAt: true,
          product: { select: { id: true, name: true, images: true } },
          variant: { select: { id: true, name: true } },
        },
      });
      expect(result).toEqual([{ id: 'req-1' }]);
    });
  });

  describe('count()', () => {
    it('returns the total number of restock requests for the store', async () => {
      prisma.store.findUnique.mockResolvedValue(store);
      prisma.restockRequest.count.mockResolvedValue(7);

      const result = await service.count('store-1', 'user-1');

      expect(prisma.restockRequest.count).toHaveBeenCalledWith({
        where: { storeId: 'store-1' },
      });
      expect(result).toEqual({ count: 7 });
    });

    it('throws NotFoundException when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.count('store-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the user is not the owner', async () => {
      prisma.store.findUnique.mockResolvedValue(store);

      await expect(service.count('store-1', 'intruder')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
