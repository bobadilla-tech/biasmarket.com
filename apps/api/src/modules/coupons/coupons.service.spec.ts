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
      deleteMany: Mock;
      count: Mock;
    };
    user: {
      findUnique: Mock;
      update: Mock;
    };
    $transaction: Mock;
  };

  // Every redeemCoupon/unredeemCoupon transaction locks a row via
  // tx.$queryRaw`... FOR UPDATE` before reading/writing it (H2/M1/H4) — the
  // returned row's shape only needs to be truthy for the coupon lock, and
  // needs `premiumUntil` for the user lock in redeemCoupon.
  function lockRow(row: Record<string, unknown>) {
    return vi.fn().mockResolvedValue([row]);
  }

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
        deleteMany: vi.fn(),
        count: vi.fn(),
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

  it('rejects a coupon before its start window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));

    prisma.coupon.findUnique.mockResolvedValue({
      id: 'coupon-1',
      code: 'PREMIUM30',
      isActive: true,
      startsAt: new Date('2026-08-15T00:00:00.000Z'),
      expiresAt: new Date('2026-09-15T00:00:00.000Z'),
      redemptions: [],
      maxUses: 1,
      durationDays: 30,
    });

    try {
      await expect(
        service.redeemCoupon({ code: 'PREMIUM30' }, {
          user: { id: 'user-1' },
        } as never),
      ).rejects.toThrow(BadRequestException);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a coupon after its expiry window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));

    prisma.coupon.findUnique.mockResolvedValue({
      id: 'coupon-1',
      code: 'PREMIUM30',
      isActive: true,
      startsAt: new Date('2026-08-01T00:00:00.000Z'),
      expiresAt: new Date('2026-09-15T00:00:00.000Z'),
      redemptions: [],
      maxUses: 1,
      durationDays: 30,
    });

    try {
      await expect(
        service.redeemCoupon({ code: 'PREMIUM30' }, {
          user: { id: 'user-1' },
        } as never),
      ).rejects.toThrow(BadRequestException);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a coupon that has reached its maximum uses', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      id: 'coupon-1',
      code: 'PREMIUM30',
      isActive: true,
      startsAt: null,
      expiresAt: null,
      maxUses: 2,
      durationDays: 30,
    });

    // The maxUses check runs inside the transaction against a live count, so
    // no redemptions are kept on the coupon lookup (they're no longer loaded).
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: lockRow({ id: 'coupon-1' }),
        couponRedemption: {
          findUnique: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(2),
        },
      }),
    );

    await expect(
      service.redeemCoupon({ code: 'PREMIUM30' }, {
        user: { id: 'user-1' },
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a coupon the user already redeemed', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      id: 'coupon-1',
      code: 'PREMIUM30',
      isActive: true,
      startsAt: null,
      expiresAt: null,
      maxUses: 10,
      durationDays: 30,
    });

    // The duplicate check runs inside the transaction via findUnique on the
    // tx client.
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: lockRow({ id: 'coupon-1' }),
        couponRedemption: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'r1',
            couponId: 'coupon-1',
            userId: 'user-1',
          }),
        },
      }),
    );

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
        $queryRaw: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'coupon-1' }])
          .mockResolvedValueOnce([{ id: 'user-1', premiumUntil: null }]),
        couponRedemption: {
          findUnique: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
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
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'premium', premiumUntil: expect.any(Date) },
    });
  });

  it("wires the redeemed coupon's own plan through to the user update instead of a hardcoded value (M3)", async () => {
    const coupon = {
      id: 'coupon-1',
      code: 'VIP30',
      name: 'VIP 30 days',
      description: '',
      plan: 'vip',
      durationDays: 30,
      maxUses: 2,
      isActive: true,
      startsAt: null,
      expiresAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    prisma.coupon.findUnique.mockResolvedValue(coupon);

    const txUserUpdate = vi.fn().mockResolvedValue({ id: 'user-1' });
    const txCouponRedemptionCreate = vi.fn().mockResolvedValue({
      id: 'redemption-1',
      couponId: 'coupon-1',
      userId: 'user-1',
      redeemedAt: new Date('2026-08-14T00:00:00.000Z'),
      expiresAt: new Date('2026-09-13T00:00:00.000Z'),
      user: {
        id: 'user-1',
        email: 'demo@example.com',
        name: 'Demo User',
        stores: [],
      },
    });

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'coupon-1' }])
          .mockResolvedValueOnce([{ id: 'user-1', premiumUntil: null }]),
        couponRedemption: {
          findUnique: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          create: txCouponRedemptionCreate,
        },
        user: { update: txUserUpdate },
      }),
    );

    await service.redeemCoupon({ code: 'vip30' }, {
      user: { id: 'user-1' },
    } as never);

    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'vip', premiumUntil: expect.any(Date) },
    });
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
        $queryRaw: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'coupon-1' }])
          .mockResolvedValueOnce([
            { id: 'user-1', premiumUntil: existingUntil },
          ]),
        couponRedemption: {
          findUnique: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
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

  it('resets the user to basic when unredeeming their only redemption', async () => {
    const expiresAt = new Date('2026-09-13T00:00:00.000Z');
    prisma.couponRedemption.findUnique.mockResolvedValue({
      id: 'redemption-1',
      couponId: 'coupon-1',
      userId: 'user-1',
      expiresAt,
    });

    const txDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const txFindMany = vi.fn().mockResolvedValue([]);
    const txUserUpdate = vi.fn().mockResolvedValue({});

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: lockRow({ id: 'user-1' }),
        couponRedemption: { deleteMany: txDeleteMany, findMany: txFindMany },
        user: { update: txUserUpdate },
      }),
    );

    const result = await service.unredeemCoupon('coupon-1', 'redemption-1');

    expect(result.unredeemed).toBe(true);
    expect(txDeleteMany).toHaveBeenCalledWith({
      where: { id: 'redemption-1' },
    });
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'basic', premiumUntil: null },
    });
  });

  // H4 regression: user stacked two coupons (coupon A: expires Sep 12,
  // coupon B: expires Oct 12, the combined stacked total). The old code
  // compared user.premiumUntil to a single redemption's own expiresAt, which
  // breaks in both directions once more than one redemption is involved —
  // these two tests cover both.
  it("unredeeming the earlier of two stacked coupons keeps the later coupon's entitlement, not the full stack (H4)", async () => {
    const earlierExpiry = new Date('2026-09-12T00:00:00.000Z');
    const laterExpiry = new Date('2026-10-12T00:00:00.000Z');

    // Redemption being revoked is the *earlier* one — its own expiresAt
    // never equals the stacked user.premiumUntil (laterExpiry), which is
    // exactly what made the old equality check silently no-op here.
    prisma.couponRedemption.findUnique.mockResolvedValue({
      id: 'redemption-earlier',
      couponId: 'coupon-a',
      userId: 'user-1',
      expiresAt: earlierExpiry,
    });

    const txDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const txFindMany = vi.fn().mockResolvedValue([
      {
        expiresAt: laterExpiry,
        coupon: { plan: 'premium' },
      },
    ]);
    const txUserUpdate = vi.fn().mockResolvedValue({});

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: lockRow({ id: 'user-1' }),
        couponRedemption: { deleteMany: txDeleteMany, findMany: txFindMany },
        user: { update: txUserUpdate },
      }),
    );

    await service.unredeemCoupon('coupon-a', 'redemption-earlier');

    // Must be recomputed to the remaining coupon's own expiry, not left at
    // the stale stacked total and not wiped to basic.
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'premium', premiumUntil: laterExpiry },
    });
  });

  it("unredeeming the later of two stacked coupons falls back to the earlier coupon's entitlement instead of wiping it out (H4)", async () => {
    const earlierExpiry = new Date('2026-09-12T00:00:00.000Z');
    const laterExpiry = new Date('2026-10-12T00:00:00.000Z');

    // Redemption being revoked is the *later* one — its own expiresAt
    // equals the stacked user.premiumUntil (laterExpiry), which is exactly
    // what made the old equality check wipe the user to basic, destroying
    // the still-valid earlier redemption's entitlement too.
    prisma.couponRedemption.findUnique.mockResolvedValue({
      id: 'redemption-later',
      couponId: 'coupon-b',
      userId: 'user-1',
      expiresAt: laterExpiry,
    });

    const txDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const txFindMany = vi.fn().mockResolvedValue([
      {
        expiresAt: earlierExpiry,
        coupon: { plan: 'premium' },
      },
    ]);
    const txUserUpdate = vi.fn().mockResolvedValue({});

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: lockRow({ id: 'user-1' }),
        couponRedemption: { deleteMany: txDeleteMany, findMany: txFindMany },
        user: { update: txUserUpdate },
      }),
    );

    await service.unredeemCoupon('coupon-b', 'redemption-later');

    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'premium', premiumUntil: earlierExpiry },
    });
  });

  it('throws when a redemption is not found', async () => {
    prisma.couponRedemption.findUnique.mockResolvedValue(null);

    await expect(service.unredeemCoupon('coupon-1', 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws (L1) when the redemption exists but belongs to a different coupon', async () => {
    prisma.couponRedemption.findUnique.mockResolvedValue({
      id: 'redemption-1',
      couponId: 'coupon-a',
      userId: 'user-1',
      expiresAt: new Date('2026-09-13T00:00:00.000Z'),
    });

    await expect(
      service.unredeemCoupon('coupon-b', 'redemption-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
