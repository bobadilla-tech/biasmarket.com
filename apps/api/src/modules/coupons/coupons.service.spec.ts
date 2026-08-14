import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { CouponsService } from './coupons.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('CouponsService', () => {
  let service: CouponsService;
  let prisma: {
    coupon: {
      findUnique: Mock;
      create: Mock;
      findMany: Mock;
    };
    couponRedemption: {
      findUnique: Mock;
      create: Mock;
      findMany: Mock;
    };
    user: {
      findUnique: Mock;
      update: Mock;
    };
    $transaction: Mock;
  };

  beforeEach(async () => {
    prisma = {
      coupon: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
      couponRedemption: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CouponsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CouponsService);
  });

  it('rejects inactive coupons', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      id: 'coupon-1',
      code: 'PREMIUM30',
      isActive: false,
      startsAt: null,
      expiresAt: null,
      redemptions: [],
      maxUses: 1,
      durationDays: 30,
    });

    await expect(
      service.redeemCoupon({ code: 'PREMIUM30' }, {
        user: { id: 'user-1' },
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('redeems a valid coupon and grants premium access', async () => {
    const coupon = {
      id: 'coupon-1',
      code: 'PREMIUM30',
      name: 'Premium 30 days',
      description: '',
      plan: 'premium',
      durationDays: 30,
      maxUses: 2,
      isActive: true,
      startsAt: null,
      expiresAt: null,
      redemptions: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    prisma.coupon.findUnique.mockResolvedValue(coupon);
    prisma.couponRedemption.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ premiumUntil: null });

    const txUserUpdate = vi.fn().mockResolvedValue({ id: 'user-1' });
    const txCouponRedemptionCreate = vi.fn().mockResolvedValue({
      id: 'redemption-1',
      couponId: 'coupon-1',
      userId: 'user-1',
      redeemedAt: new Date('2026-08-14T00:00:00.000Z'),
      expiresAt: new Date('2026-09-12T00:00:00.000Z'),
      user: { id: 'user-1', email: 'demo@example.com', name: 'Demo User' },
    });

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        couponRedemption: {
          create: txCouponRedemptionCreate,
        },
        user: {
          update: txUserUpdate,
        },
      }),
    );

    const result = await service.redeemCoupon({ code: 'premium30' }, {
      user: { id: 'user-1' },
    } as never);

    expect(result.userEmail).toBe('demo@example.com');
    expect(result.expiresAt).toBe('2026-09-12T00:00:00.000Z');
    expect(txUserUpdate).toHaveBeenCalled();
  });

  it('lists coupons with redemption counts', async () => {
    prisma.coupon.findMany.mockResolvedValue([
      {
        id: 'coupon-1',
        code: 'PREMIUM30',
        name: 'Premium 30 days',
        description: '',
        plan: 'premium',
        durationDays: 30,
        maxUses: 1,
        isActive: true,
        startsAt: null,
        expiresAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        _count: { redemptions: 2 },
      },
    ]);

    const result = await service.listCoupons();
    expect(result[0].redemptionCount).toBe(2);
    expect(result[0].code).toBe('PREMIUM30');
  });

  it('updates a coupon and preserves the premium 30-day duration', async () => {
    const coupon = {
      id: 'coupon-1',
      code: 'PREMIUM30',
      name: 'Premium 30 days',
      description: '',
      plan: 'premium',
      durationDays: 30,
      maxUses: 2,
      isActive: true,
      startsAt: null,
      expiresAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    prisma.coupon.findUnique.mockResolvedValue(coupon);
    prisma.coupon.create.mockResolvedValue(coupon);

    const result = await service.updateCoupon('coupon-1', {
      code: 'VIP30',
      name: 'VIP 30 days',
      startsAt: '2026-08-20T00:00:00.000Z',
      expiresAt: '2026-09-20T00:00:00.000Z',
    });

    expect(result.code).toBe('VIP30');
    expect(result.durationDays).toBe(30);
    expect(result.plan).toBe('premium');
  });

  it('toggles a coupon active state', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      id: 'coupon-1',
      code: 'PREMIUM30',
      isActive: true,
      durationDays: 30,
      plan: 'premium',
      name: 'Premium 30 days',
      description: '',
      startsAt: null,
      expiresAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    prisma.coupon.update = vi.fn().mockResolvedValue({
      id: 'coupon-1',
      isActive: false,
    });

    const result = await service.toggleCouponStatus('coupon-1');

    expect(result.isActive).toBe(false);
  });

  it('throws when a coupon is not found', async () => {
    prisma.coupon.findUnique.mockResolvedValue(null);

    await expect(
      service.redeemCoupon({ code: 'MISSING' }, {
        user: { id: 'user-1' },
      } as never),
    ).rejects.toThrow(NotFoundException);
  });
});
