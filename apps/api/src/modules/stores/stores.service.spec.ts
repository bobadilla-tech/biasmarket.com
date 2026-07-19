import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StoresService } from './stores.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('StoresService', () => {
  let service: StoresService;
  let prisma: {
    store: { findUnique: jest.Mock; create: jest.Mock; findMany: jest.Mock };
  };

  const ownerId = 'user-1';

  beforeEach(async () => {
    prisma = {
      store: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
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
});
