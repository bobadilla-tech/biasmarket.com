import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { StoresService } from './stores.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('StoresService', () => {
  let service: StoresService;
  let prisma: {
    store: { findUnique: Mock; create: Mock; findMany: Mock; update: Mock };
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StoresService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<StoresService>(StoresService);
  });

  it('rejects reserved slugs without touching the database', async () => {
    await expect(service.create(ownerId, 'My Store', 'admin')).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.store.create).not.toHaveBeenCalled();
  });

  it('rejects a slug that already exists', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 'existing-store' });

    await expect(
      service.create(ownerId, 'My Store', 'my-store'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.store.create).not.toHaveBeenCalled();
  });

  it('creates the store with a slugified slug when unique and not reserved', async () => {
    prisma.store.findUnique.mockResolvedValue(null);
    prisma.store.create.mockResolvedValue({ id: 'store-1' });

    await service.create(ownerId, 'My Cool Store!', 'My Cool Store!');

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
