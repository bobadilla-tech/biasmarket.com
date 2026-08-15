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
      update: Mock;
    };
    couponRedemption: {
      findUnique: Mock;
      create: Mock;
      findMany: Mock;
      delete: Mock;
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
        update: vi.fn(),
      },
      couponRedemption: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
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
      user: {
        id: 'user-1',
        email: 'demo@example.com',
        name: 'Demo User',
        stores: [],
      },
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

  it('stacks the new duration on top of remaining premium time', async () => {
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

    // User already has premium active until Sep 12, 2026 (10 days from now on
    // the mocked "now"). Redeeming a 30-day coupon should extend to Oct 12,
    // stacking on the remaining window rather than resetting from today.
    const existingUntil = new Date('2026-09-12T00:00:00.000Z');
    const expectedExpiry = new Date(
      existingUntil.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const expectedExpiryIso = expectedExpiry.toISOString();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T00:00:00.000Z'));

    prisma.coupon.findUnique.mockResolvedValue(coupon);
    prisma.couponRedemption.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ premiumUntil: existingUntil });

    const txCouponRedemptionCreate = vi.fn().mockResolvedValue({
      id: 'redemption-2',
      couponId: 'coupon-1',
      userId: 'user-1',
      redeemedAt: new Date('2026-09-02T00:00:00.000Z'),
      expiresAt: expectedExpiry,
      user: {
        id: 'user-1',
        email: 'demo@example.com',
        name: 'Demo User',
        stores: [],
      },
    });
    const txUserUpdate = vi.fn().mockResolvedValue({ id: 'user-1' });

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

    try {
      const result = await service.redeemCoupon({ code: 'premium30' }, {
        user: { id: 'user-1' },
      } as never);

      expect(result.expiresAt).toBe(expectedExpiryIso);
      // The user update must stack on the existing premium window, not reset.
      expect(txUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          plan: 'premium',
          premiumUntil: expectedExpiry,
        },
      });
    } finally {
      vi.useRealTimers();
    }
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

    prisma.coupon.findUnique.mockImplementation(async (args) => {
      // Only treat the by-id lookup as the existing coupon; a by-code lookup
      // must return null (no duplicate code exists).
      if (args.where.id) return coupon;
      return null;
    });

    prisma.coupon.update = vi.fn().mockResolvedValue({
      ...coupon,
      code: 'VIP30',
      name: 'VIP 30 days',
      startsAt: new Date('2026-08-20T00:00:00.000Z'),
      expiresAt: new Date('2026-09-20T00:00:00.000Z'),
      durationDays: 30,
      _count: { redemptions: 0 },
    });

    const result = await service.updateCoupon('coupon-1', {
      code: 'VIP30',
      name: 'VIP 30 days',
      maxUses: 5,
      startsAt: '2026-08-20T00:00:00.000Z',
      expiresAt: '2026-09-20T00:00:00.000Z',
    });

    expect(result.code).toBe('VIP30');
    expect(result.durationDays).toBe(30);
    expect(result.plan).toBe('premium');
    expect(prisma.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maxUses: 5 }),
      }),
    );
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
      code: 'PREMIUM30',
      name: 'Premium 30 days',
      description: '',
      plan: 'premium',
      durationDays: 30,
      maxUses: 1,
      startsAt: null,
      expiresAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      _count: { redemptions: 0 },
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

  it('lists redemptions with the user store slug', async () => {
    prisma.coupon.findUnique.mockResolvedValue({ id: 'coupon-1' });
    prisma.couponRedemption.findMany.mockResolvedValue([
      {
        id: 'redemption-1',
        couponId: 'coupon-1',
        userId: 'user-1',
        redeemedAt: new Date('2026-08-14T00:00:00.000Z'),
        expiresAt: new Date('2026-09-13T00:00:00.000Z'),
        user: {
          email: 'demo@example.com',
          name: 'Demo User',
          stores: [{ slug: 'demo-store' }],
        },
      },
    ]);

    const result = await service.getRedemptions('coupon-1');

    expect(result[0].userEmail).toBe('demo@example.com');
    expect(result[0].storeSlug).toBe('demo-store');
  });

  it('unredeems a coupon and resets premium when the window matches', async () => {
    const expiresAt = new Date('2026-09-13T00:00:00.000Z');
    prisma.couponRedemption.findUnique.mockResolvedValue({
      id: 'redemption-1',
      couponId: 'coupon-1',
      userId: 'user-1',
      expiresAt,
      coupon: { id: 'coupon-1' },
    });

    const txCouponRedemptionDelete = vi.fn().mockResolvedValue({});
    const txUserFindUnique = vi
      .fn()
      .mockResolvedValue({ plan: 'premium', premiumUntil: expiresAt });
    const txUserUpdate = vi.fn().mockResolvedValue({});

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        couponRedemption: { delete: txCouponRedemptionDelete },
        user: {
          findUnique: txUserFindUnique,
          update: txUserUpdate,
        },
      }),
    );

    const result = await service.unredeemCoupon('redemption-1');

    expect(result.unredeemed).toBe(true);
    expect(txCouponRedemptionDelete).toHaveBeenCalledWith({
      where: { id: 'redemption-1' },
    });
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'basic', premiumUntil: null },
    });
  });

  it('unredeems a coupon but leaves premium intact when the window differs', async () => {
    prisma.couponRedemption.findUnique.mockResolvedValue({
      id: 'redemption-1',
      couponId: 'coupon-1',
      userId: 'user-1',
      expiresAt: new Date('2026-09-13T00:00:00.000Z'),
      coupon: { id: 'coupon-1' },
    });

    const txCouponRedemptionDelete = vi.fn().mockResolvedValue({});
    const txUserFindUnique = vi.fn().mockResolvedValue({
      plan: 'premium',
      premiumUntil: new Date('2026-12-01T00:00:00.000Z'),
    });
    const txUserUpdate = vi.fn().mockResolvedValue({});

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        couponRedemption: { delete: txCouponRedemptionDelete },
        user: {
          findUnique: txUserFindUnique,
          update: txUserUpdate,
        },
      }),
    );

    await service.unredeemCoupon('redemption-1');

    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it('throws when a redemption is not found', async () => {
    prisma.couponRedemption.findUnique.mockResolvedValue(null);

    await expect(service.unredeemCoupon('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
