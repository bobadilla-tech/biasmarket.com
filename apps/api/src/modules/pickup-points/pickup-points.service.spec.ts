import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { PickupPointsService } from './pickup-points.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('PickupPointsService', () => {
  let service: PickupPointsService;
  let prisma: {
    store: { findUnique: Mock };
    pickupPoint: {
      findUnique: Mock;
      findMany: Mock;
      create: Mock;
      update: Mock;
      delete: Mock;
    };
  };

  const ownerId = 'user-1';
  const storeId = 'store-1';
  const pointId = 'point-1';

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      pickupPoint: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PickupPointsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PickupPointsService>(PickupPointsService);
  });

  describe('ownership checks', () => {
    it('throws NotFoundException when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.findAllForStore(storeId, ownerId)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the user does not own the store', async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId: 'someone-else' });

      await expect(service.findAllForStore(storeId, ownerId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when updating a point that belongs to a different store', async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.pickupPoint.findUnique.mockResolvedValue({ id: pointId, storeId: 'other-store' });

      await expect(
        service.update(pointId, storeId, ownerId, { label: 'New label' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('CRUD', () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it('creates a pickup point scoped to the store', async () => {
      prisma.pickupPoint.create.mockResolvedValue({ id: pointId });

      await service.create(storeId, ownerId, { label: 'Plaza Norte' });

      expect(prisma.pickupPoint.create).toHaveBeenCalledWith({
        data: { storeId, label: 'Plaza Norte', enabled: true, sortOrder: 0 },
      });
    });

    it('removes an owned point', async () => {
      prisma.pickupPoint.findUnique.mockResolvedValue({ id: pointId, storeId });

      await service.remove(pointId, storeId, ownerId);

      expect(prisma.pickupPoint.delete).toHaveBeenCalledWith({ where: { id: pointId } });
    });
  });

  describe('findEnabledForSlug', () => {
    it('throws NotFoundException when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.findEnabledForSlug('missing-slug')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('only returns enabled points, ordered by sortOrder', async () => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, slug: 'my-store' });
      prisma.pickupPoint.findMany.mockResolvedValue([{ id: pointId, enabled: true }]);

      const result = await service.findEnabledForSlug('my-store');

      expect(prisma.pickupPoint.findMany).toHaveBeenCalledWith({
        where: { storeId, enabled: true },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([{ id: pointId, enabled: true }]);
    });
  });
});
