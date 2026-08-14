import { Test, type TestingModule } from '@nestjs/testing';
import { type Mock, vi } from 'vitest';
import { UsersService } from './users.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: { store: { groupBy: Mock } };

  beforeEach(async () => {
    prisma = { store: { groupBy: vi.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStoreCounts', () => {
    it('maps each owner to their store count', async () => {
      prisma.store.groupBy.mockResolvedValue([
        { ownerId: 'user-1', _count: 2 },
        { ownerId: 'user-2', _count: 1 },
      ]);

      const result = await service.getStoreCounts();

      expect(prisma.store.groupBy).toHaveBeenCalledWith({
        by: ['ownerId'],
        _count: true,
      });
      expect(result).toEqual([
        { userId: 'user-1', storeCount: 2 },
        { userId: 'user-2', storeCount: 1 },
      ]);
    });

    it('returns an empty list when no store owners exist', async () => {
      prisma.store.groupBy.mockResolvedValue([]);
      expect(await service.getStoreCounts()).toEqual([]);
    });
  });
});
