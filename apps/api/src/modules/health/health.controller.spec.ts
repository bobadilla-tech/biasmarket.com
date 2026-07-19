import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { HealthController } from './health.controller.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRaw: Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns ok when the database responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'ok',
    });
  });

  it('throws ServiceUnavailableException when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(controller.check()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
