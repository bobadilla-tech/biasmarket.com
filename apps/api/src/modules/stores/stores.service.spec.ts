import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { StoresService } from './stores.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('StoresService', () => {
  let service: StoresService;
  let prisma: {
    store: { findUnique: Mock; create: Mock; findMany: Mock; update: Mock };
    deliveryMethodConfig: { create: Mock };
    paymentMethodConfig: { createMany: Mock };
    storeSection: { findMany: Mock };
    product: { findMany: Mock };
    $transaction: Mock;
  };

  const ownerId = 'user-1';

  beforeEach(async () => {
    prisma = {
      store: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      deliveryMethodConfig: { create: vi.fn() },
      paymentMethodConfig: { createMany: vi.fn() },
      storeSection: { findMany: vi.fn() },
      product: { findMany: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StoresService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<StoresService>(StoresService);
  });

  const createDto = { name: 'My Store', slug: 'my-store', whatsappNumber: '+51999999999' };

  it('rejects reserved slugs without touching the database', async () => {
    await expect(
      service.create(ownerId, { ...createDto, slug: 'admin' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.store.create).not.toHaveBeenCalled();
  });

  it('rejects a slug that already exists', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 'existing-store' });

    await expect(service.create(ownerId, createDto)).rejects.toThrow(BadRequestException);

    expect(prisma.store.create).not.toHaveBeenCalled();
  });

  it('creates the store with a slugified slug, whatsappNumber, and a default PICKUP delivery method', async () => {
    prisma.store.findUnique.mockResolvedValue(null);
    prisma.store.create.mockResolvedValue({ id: 'store-1' });

    await service.create(ownerId, {
      name: 'My Cool Store!',
      slug: 'My Cool Store!',
      whatsappNumber: '+51999999999',
    });

    expect(prisma.store.findUnique).toHaveBeenCalledWith({
      where: { slug: 'my-cool-store' },
    });
    expect(prisma.store.create).toHaveBeenCalledWith({
      data: {
        name: 'My Cool Store!',
        slug: 'my-cool-store',
        ownerId,
        themeConfig: {},
        paymentInstructions: '',
        whatsappNumber: '+51999999999',
      },
    });
    expect(prisma.deliveryMethodConfig.create).toHaveBeenCalledWith({
      data: { storeId: 'store-1', type: 'PICKUP', enabled: true, details: {} },
    });
  });

  it('persists a provided themeConfig during creation', async () => {
    prisma.store.findUnique.mockResolvedValue(null);
    prisma.store.create.mockResolvedValue({ id: 'store-2' });

    await service.create(ownerId, {
      ...createDto,
      themeConfig: {
        paletteId: 'royal-bloom',
        colors: { primary: '#7c3aed', accent: '#f472b6' },
      },
    });

    expect(prisma.store.create).toHaveBeenCalledWith({
      data: {
        name: 'My Store',
        slug: 'my-store',
        ownerId,
        themeConfig: {
          paletteId: 'royal-bloom',
          colors: { primary: '#7c3aed', accent: '#f472b6' },
        },
        paymentInstructions: '',
        whatsappNumber: '+51999999999',
      },
    });
  });

  it('findAllForUser() lists stores scoped to the owner', async () => {
    prisma.store.findMany.mockResolvedValue([]);

    await service.findAllForUser(ownerId);

    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: { ownerId },
    });
  });

  describe('findBySlugForOwner()', () => {
    it('throws NotFoundException when no store has that slug', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.findBySlugForOwner('missing', ownerId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the user does not own the store', async () => {
      prisma.store.findUnique.mockResolvedValue({ id: 'store-1', ownerId: 'someone-else' });

      await expect(service.findBySlugForOwner('my-store', ownerId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns the store when the user owns it', async () => {
      prisma.store.findUnique.mockResolvedValue({ id: 'store-1', slug: 'my-store', ownerId });

      const result = await service.findBySlugForOwner('my-store', ownerId);

      expect(result).toEqual({ id: 'store-1', slug: 'my-store', ownerId });
    });
  });

  describe('update()', () => {
    it('throws NotFoundException when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.update('store-1', ownerId, { whatsappNumber: '+51999999999' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the user does not own the store', async () => {
      prisma.store.findUnique.mockResolvedValue({ id: 'store-1', ownerId: 'someone-else' });

      await expect(
        service.update('store-1', ownerId, { whatsappNumber: '+51999999999' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates whatsappNumber when the user owns the store', async () => {
      prisma.store.findUnique.mockResolvedValue({ id: 'store-1', ownerId });
      prisma.store.update.mockResolvedValue({ id: 'store-1' });

      await service.update('store-1', ownerId, { whatsappNumber: '+51999999999' });

      expect(prisma.store.update).toHaveBeenCalledWith({
        where: { id: 'store-1' },
        data: { whatsappNumber: '+51999999999' },
      });
    });

    it('updates themeConfig when the user changes the palette', async () => {
      prisma.store.findUnique.mockResolvedValue({ id: 'store-1', ownerId });
      prisma.store.update.mockResolvedValue({ id: 'store-1' });

      await service.update('store-1', ownerId, {
        themeConfig: {
          paletteId: 'mint-stage',
          colors: { primary: '#0f766e', accent: '#22c55e' },
        },
      });

      expect(prisma.store.update).toHaveBeenCalledWith({
        where: { id: 'store-1' },
        data: {
          themeConfig: {
            paletteId: 'mint-stage',
            colors: { primary: '#0f766e', accent: '#22c55e' },
          },
        },
      });
    });
  });

  describe('findPublicBySlug()', () => {
    const storeId = 'store-1';
    const productA = { id: 'product-a', status: 'PUBLISHED', deletedAt: null };
    const productB = { id: 'product-b', status: 'PUBLISHED', deletedAt: null };

    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, slug: 'my-store' });
    });

    it('throws NotFoundException when no store has that slug', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.findPublicBySlug('missing')).rejects.toThrow(NotFoundException);
    });

    it('lists every published product directly when the store has no sections configured', async () => {
      prisma.storeSection.findMany.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([productA, productB]);

      const result = await service.findPublicBySlug('my-store');

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { storeId, status: 'PUBLISHED', deletedAt: null, id: { notIn: [] } },
        include: { variants: true },
      });
      expect(result.sections).toHaveLength(1);
      const productIds = result.sections[0].collection!.products.map((cp: { productId: string }) => cp.productId);
      expect(productIds).toEqual([productA.id, productB.id]);
    });

    it('appends a trailing catch-all section for a published product never added to a collection', async () => {
      prisma.storeSection.findMany.mockResolvedValue([
        {
          id: 'section-1',
          storeId,
          position: 0,
          collection: {
            id: 'collection-1',
            name: 'Destacados',
            products: [{ collectionId: 'collection-1', productId: productA.id, position: 0, product: productA }],
          },
        },
      ]);
      prisma.product.findMany.mockResolvedValue([productB]);

      const result = await service.findPublicBySlug('my-store');

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { storeId, status: 'PUBLISHED', deletedAt: null, id: { notIn: [productA.id] } },
        include: { variants: true },
      });
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].collection!.name).toBe('Destacados');
      expect(result.sections[1].collection!.products.map((cp: { productId: string }) => cp.productId)).toEqual([
        productB.id,
      ]);
    });

    it('does not append a trailing section when every published product is already covered', async () => {
      prisma.storeSection.findMany.mockResolvedValue([
        {
          id: 'section-1',
          storeId,
          position: 0,
          collection: {
            id: 'collection-1',
            name: 'Destacados',
            products: [{ collectionId: 'collection-1', productId: productA.id, position: 0, product: productA }],
          },
        },
      ]);
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.findPublicBySlug('my-store');

      expect(result.sections).toHaveLength(1);
    });

    it('excludes DRAFT and soft-deleted products from a real collection section', async () => {
      const draftProduct = { id: 'product-draft', status: 'DRAFT', deletedAt: null };
      const deletedProduct = { id: 'product-deleted', status: 'PUBLISHED', deletedAt: new Date() };
      prisma.storeSection.findMany.mockResolvedValue([
        {
          id: 'section-1',
          storeId,
          position: 0,
          collection: {
            id: 'collection-1',
            name: 'Destacados',
            products: [
              { collectionId: 'collection-1', productId: productA.id, position: 0, product: productA },
              { collectionId: 'collection-1', productId: draftProduct.id, position: 1, product: draftProduct },
              { collectionId: 'collection-1', productId: deletedProduct.id, position: 2, product: deletedProduct },
            ],
          },
        },
      ]);
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.findPublicBySlug('my-store');

      expect(result.sections[0].collection!.products.map((cp: { productId: string }) => cp.productId)).toEqual([
        productA.id,
      ]);
    });
  });
});
