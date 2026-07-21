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
  });
});
