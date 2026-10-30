import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StoreReferencesService } from './store-references.service.js';

describe('StoreReferencesService', () => {
  let service: StoreReferencesService;
  let prisma: {
    store: { findUnique: Mock };
    storeReference: {
      count: Mock;
      create: Mock;
      findMany: Mock;
      findFirst: Mock;
      findUnique: Mock;
      update: Mock;
      delete: Mock;
    };
    auditLog: { create: Mock };
    $transaction: Mock;
  };

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      storeReference: {
        count: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreReferencesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(StoreReferencesService);
  });

  it('rejects writes by users who do not own the store', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: 'store-a',
      ownerId: 'owner-a',
    });
    await expect(
      service.create('store-a', 'owner-b', {
        imageUrl: 'https://cdn.test/ref.jpg',
        takenAt: new Date(),
        width: 800,
        height: 600,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.storeReference.create).not.toHaveBeenCalled();
  });

  it('stores an owned reference and writes an audit event atomically', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: 'store-a',
      ownerId: 'owner-a',
    });
    prisma.storeReference.count.mockResolvedValue(0);
    prisma.storeReference.create.mockResolvedValue({ id: 'ref-1' });

    await service.create('store-a', 'owner-a', {
      imageUrl: 'https://cdn.test/ref.jpg',
      takenAt: new Date('2026-10-01T00:00:00.000Z'),
      width: 800,
      height: 600,
    });

    expect(prisma.storeReference.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 'store-a',
        imageUrl: 'https://cdn.test/ref.jpg',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 'store-a',
        actorId: 'owner-a',
        action: 'store_reference.created',
        entityId: 'ref-1',
      }),
    });
  });

  it('filters hidden references and sorts newest first on the public API', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 'store-a' });
    prisma.storeReference.findMany.mockResolvedValue([]);
    prisma.storeReference.count.mockResolvedValue(0);

    await service.findPublic('shop', 'recientes', 2, 24);

    expect(prisma.storeReference.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-a', hidden: false },
      orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
      skip: 24,
      take: 24,
    });
    expect(prisma.storeReference.count).toHaveBeenCalledWith({
      where: { storeId: 'store-a', hidden: false },
    });
  });

  it('does not return public data for an unknown store', async () => {
    prisma.store.findUnique.mockResolvedValue(null);
    await expect(
      service.findPublic('missing', 'recientes', 1, 24),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.storeReference.findMany).not.toHaveBeenCalled();
  });
});
