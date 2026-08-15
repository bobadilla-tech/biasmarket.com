import { Test, type TestingModule } from '@nestjs/testing';
import { type Mock, vi } from 'vitest';
import { ExpirePremiumUseCase } from './expire-premium.usecase.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('ExpirePremiumUseCase', () => {
  let useCase: ExpirePremiumUseCase;
  let prisma: { user: { updateMany: Mock } };

  beforeEach(async () => {
    prisma = { user: { updateMany: vi.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpirePremiumUseCase,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    useCase = module.get(ExpirePremiumUseCase);
  });

  it('resets plan/premiumUntil for every user whose premiumUntil has passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    prisma.user.updateMany.mockResolvedValue({ count: 3 });

    try {
      const result = await useCase.execute();

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          plan: 'premium',
          premiumUntil: { lt: new Date('2026-09-01T00:00:00.000Z') },
        },
        data: { plan: 'basic', premiumUntil: null },
      });
      expect(result).toEqual({ expired: 3 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns expired: 0 when nothing has expired', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    const result = await useCase.execute();

    expect(result).toEqual({ expired: 0 });
  });
});
