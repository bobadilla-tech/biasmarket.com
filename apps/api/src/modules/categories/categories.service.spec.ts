import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { CategoriesService } from './categories.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    store: { findUnique: Mock };
    category: {
      findUnique: Mock;
      findMany: Mock;
      create: Mock;
      update: Mock;
      delete: Mock;
      count: Mock;
    };
    productCategory: { count: Mock };
  };

  const ownerId = 'user-1';
  const storeId = 'store-1';
  const categoryId = 'category-1';

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      category: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      productCategory: { count: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  describe('ownership checks', () => {
    it('throws NotFoundException when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.findAllForStore(storeId, ownerId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the user does not own the store', async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: storeId,
        ownerId: 'someone-else',
      });

      await expect(
        service.findAllForStore(storeId, ownerId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create()', () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it('creates a top-level category when no parentId is given', async () => {
      prisma.category.create.mockResolvedValue({ id: categoryId });

      await service.create(storeId, ownerId, { name: 'Photocards' });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Photocards', parentId: undefined, storeId },
      });
    });

    it('throws BadRequestException when parentId does not belong to the store', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'parent-1',
        storeId: 'other-store',
      });

      await expect(
        service.create(storeId, ownerId, { name: 'BTS', parentId: 'parent-1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update()', () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.category.findUnique.mockResolvedValue({
        id: categoryId,
        storeId,
        parentId: null,
      });
    });

    it('throws BadRequestException when a category is set as its own parent', async () => {
      await expect(
        service.update(categoryId, storeId, ownerId, { parentId: categoryId }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete()', () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.category.findUnique.mockResolvedValue({ id: categoryId, storeId });
    });

    it('throws ConflictException when the category has children', async () => {
      prisma.category.count.mockResolvedValue(1);
      prisma.productCategory.count.mockResolvedValue(0);

      await expect(
        service.delete(categoryId, storeId, ownerId),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when the category has assigned products', async () => {
      prisma.category.count.mockResolvedValue(0);
      prisma.productCategory.count.mockResolvedValue(1);

      await expect(
        service.delete(categoryId, storeId, ownerId),
      ).rejects.toThrow(ConflictException);
    });

    it('deletes the category when it has no children or products', async () => {
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
