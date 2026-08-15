import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CouponRedemptionResponseDto,
  CouponResponseDto,
  CreateCouponDto,
  RedeemCouponDto,
} from './dto/coupon.dto.js';

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

const PREMIUM_DURATION_DAYS = 30;

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  private getCouponStatus(coupon: {
    isActive: boolean;
    startsAt: Date | null;
    expiresAt: Date | null;
  }): 'active' | 'inactive' | 'expired' {
    if (!coupon.isActive) {
      return 'inactive';
    }

    const now = new Date();
    if (coupon.expiresAt && now > coupon.expiresAt) {
      return 'expired';
    }

    return 'active';
  }

  private toCouponResponse(
    coupon: {
      id: string;
      code: string;
      name: string;
      description: string;
      plan: string;
      durationDays: number;
      maxUses: number;
      isActive: boolean;
      startsAt: Date | null;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      _count?: { redemptions: number };
    },
    redemptionCount?: number,
  ): CouponResponseDto {
    return {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      plan: coupon.plan,
      durationDays: coupon.durationDays,
      maxUses: coupon.maxUses,
      isActive: coupon.isActive,
      status: this.getCouponStatus(coupon),
      startsAt: coupon.startsAt?.toISOString() ?? null,
      expiresAt: coupon.expiresAt?.toISOString() ?? null,
      createdAt: coupon.createdAt.toISOString(),
      updatedAt: coupon.updatedAt.toISOString(),
      redemptionCount: redemptionCount ?? coupon._count?.redemptions ?? 0,
    };
  }

  async createCoupon(
    dto: CreateCouponDto,
    adminUserId?: string,
  ): Promise<CouponResponseDto> {
    const code = normalizeCode(dto.code);

    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      throw new BadRequestException(
        'Coupon code must be 4 to 8 alphanumeric characters',
      );
    }

    const existing = await this.prisma.coupon.findUnique({
      where: { code },
    });

    if (existing) {
      throw new BadRequestException('Coupon code already exists');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (startsAt && expiresAt && expiresAt < startsAt) {
      throw new BadRequestException(
        'Coupon end date must be after the start date',
      );
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        name: dto.name,
        description: dto.description ?? '',
        plan: dto.plan ?? 'premium',
        durationDays: dto.durationDays ?? PREMIUM_DURATION_DAYS,
        maxUses: dto.maxUses ?? 1,
        isActive: dto.isActive ?? true,
        startsAt,
        expiresAt,
        createdById: adminUserId ?? null,
      },
    });

    return this.toCouponResponse(coupon);
  }

  async listCoupons(): Promise<CouponResponseDto[]> {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { redemptions: true } },
      },
    });

    return coupons.map((coupon) =>
      this.toCouponResponse(coupon, coupon._count.redemptions),
    );
  }

  async updateCoupon(
    couponId: string,
    dto: Partial<CreateCouponDto>,
  ): Promise<CouponResponseDto> {
    const existing = await this.prisma.coupon.findUnique({
      where: { id: couponId },
    });

    if (!existing) {
      throw new NotFoundException('Coupon not found');
    }

    const nextCode = dto.code ? normalizeCode(dto.code) : existing.code;
    if (!/^[A-Z0-9]{4,8}$/.test(nextCode)) {
      throw new BadRequestException(
        'Coupon code must be 4 to 8 alphanumeric characters',
      );
    }

    if (dto.code && nextCode !== existing.code) {
      const duplicate = await this.prisma.coupon.findUnique({
        where: { code: nextCode },
      });
      if (duplicate) {
        throw new BadRequestException('Coupon code already exists');
      }
    }

    const startsAt =
      dto.startsAt !== undefined
        ? dto.startsAt
          ? new Date(dto.startsAt)
          : null
        : existing.startsAt;
    const expiresAt =
      dto.expiresAt !== undefined
        ? dto.expiresAt
          ? new Date(dto.expiresAt)
          : null
        : existing.expiresAt;

    if (startsAt && expiresAt && expiresAt < startsAt) {
      throw new BadRequestException(
        'Coupon end date must be after the start date',
      );
    }

    const updated = await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        ...(dto.code ? { code: nextCode } : {}),
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description ?? '' }
          : {}),
        ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        startsAt,
        expiresAt,
        durationDays: existing.durationDays || PREMIUM_DURATION_DAYS,
      },
      include: { _count: { select: { redemptions: true } } },
    });

    return this.toCouponResponse(updated, updated._count.redemptions);
  }

  async toggleCouponStatus(couponId: string): Promise<CouponResponseDto> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    const updated = await this.prisma.coupon.update({
      where: { id: couponId },
      data: { isActive: !coupon.isActive },
      include: { _count: { select: { redemptions: true } } },
    });

    return this.toCouponResponse(updated, updated._count.redemptions);
  }

  async deleteCoupon(couponId: string): Promise<{ deleted: boolean }> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    await this.prisma.coupon.delete({ where: { id: couponId } });
    return { deleted: true };
  }

  async getRedemptions(
    couponId: string,
  ): Promise<CouponRedemptionResponseDto[]> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    const rows = await this.prisma.couponRedemption.findMany({
      where: { couponId },
      include: {
        user: {
          include: {
            stores: { select: { slug: true }, orderBy: { createdAt: 'asc' } },
          },
        },
      },
      orderBy: { redeemedAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      couponId: row.couponId,
      userId: row.userId,
      userEmail: row.user.email,
      userName: row.user.name ?? '',
      storeSlug: row.user.stores[0]?.slug ?? null,
      redeemedAt: row.redeemedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  async unredeemCoupon(redemptionId: string): Promise<{ unredeemed: boolean }> {
    const redemption = await this.prisma.couponRedemption.findUnique({
      where: { id: redemptionId },
    });

    if (!redemption) {
      throw new NotFoundException('Redemption not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Lock the user row before touching entitlement state so a concurrent
      // redeem/unredeem for the same user can't interleave with the
      // recompute below.
      const [lockedUser] = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "user" WHERE id = ${redemption.userId} FOR UPDATE`;

      if (!lockedUser) {
        return;
      }

      const deleted = await tx.couponRedemption.deleteMany({
        where: { id: redemptionId },
      });

      if (deleted.count === 0) {
        // Already unredeemed by a concurrent request; nothing left to do.
        return;
      }

      // The aggregate User.premiumUntil can't be decomposed back into what a
      // single redemption contributed once coupons are stacked: an earlier
      // redemption's own expiresAt is smaller than the stacked total (so it
      // never matches user.premiumUntil and a stale equality check would
      // no-op, leaving the revoked coupon's time granted), while a later
      // one's expiresAt does match the stacked total (so a stale equality
      // check would wipe out other still-valid redemptions). Recompute the
      // user's entitlement from their remaining, non-revoked redemptions
      // instead of comparing a single stored timestamp.
      const remaining = await tx.couponRedemption.findMany({
        where: { userId: redemption.userId },
        select: { expiresAt: true, coupon: { select: { plan: true } } },
      });

      if (remaining.length === 0) {
        await tx.user.update({
          where: { id: redemption.userId },
          data: { plan: 'basic', premiumUntil: null },
        });
        return;
      }

      const winner = remaining.reduce(
        (max, r) => (r.expiresAt > max.expiresAt ? r : max),
        remaining[0]!,
      );

      await tx.user.update({
        where: { id: redemption.userId },
        data: { plan: winner.coupon.plan, premiumUntil: winner.expiresAt },
      });
    });

    return { unredeemed: true };
  }

  async redeemCoupon(
    dto: RedeemCouponDto,
    session: UserSession,
  ): Promise<CouponRedemptionResponseDto> {
    const code = normalizeCode(dto.code);
    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    if (!coupon.isActive) {
      throw new BadRequestException('Coupon is inactive');
    }

    const now = new Date();

    if (coupon.startsAt && now < coupon.startsAt) {
      throw new BadRequestException('Coupon is not available yet');
    }

    if (coupon.expiresAt && now > coupon.expiresAt) {
      throw new BadRequestException('Coupon has expired');
    }

    const userId = session.user.id;

    // Row-lock the coupon and the user before reading any mutable state.
    // Without the lock, two concurrent redemptions of the *same* coupon by
    // different users can both count() before either commits its create —
    // both see count < maxUses under READ COMMITTED and both succeed,
    // letting total redemptions exceed maxUses (H2). The FOR UPDATE lock
    // makes the second transaction block until the first commits, so its
    // count() re-read is guaranteed to see the first's committed row.
    // Likewise, two concurrent redemptions by the *same* user (different
    // coupons) would otherwise both read the same pre-write premiumUntil and
    // each write their own computed stack, silently losing whichever commits
    // first (M1) — locking the user row serializes those against each other
    // too. Coupon is always locked before user, in that fixed order, so
    // concurrent calls can't deadlock on each other.
    const redemption = await this.prisma.$transaction(async (tx) => {
      const [lockedCoupon] = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "Coupon" WHERE id = ${coupon.id} FOR UPDATE`;

      if (!lockedCoupon) {
        throw new NotFoundException('Coupon not found');
      }

      const existingRedemption = await tx.couponRedemption.findUnique({
        where: { couponId_userId: { couponId: coupon.id, userId } },
      });

      if (existingRedemption) {
        throw new BadRequestException('This user already redeemed this coupon');
      }

      const redemptionCount = await tx.couponRedemption.count({
        where: { couponId: coupon.id },
      });

      if (redemptionCount >= coupon.maxUses) {
        throw new BadRequestException('Coupon has reached its maximum uses');
      }

      const [lockedUser] = await tx.$queryRaw<
        Array<{ id: string; premiumUntil: Date | null }>
      >`SELECT id, "premiumUntil" FROM "user" WHERE id = ${userId} FOR UPDATE`;

      if (!lockedUser) {
        throw new UnauthorizedException('User not found');
      }

      // Stack the new duration on top of any remaining premium time instead of
      // resetting the window from now. If the user already has an active plan
      // (premiumUntil in the future), the new expiry is extended from there;
      // otherwise it runs from the current time.
      const existingUntil = lockedUser.premiumUntil;
      const base =
        existingUntil && existingUntil.getTime() > now.getTime()
          ? existingUntil.getTime()
          : now.getTime();
      const premiumUntil = new Date(
        base + coupon.durationDays * 24 * 60 * 60 * 1000,
      );

      const created = await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId,
          expiresAt: premiumUntil,
        },
        include: {
          user: {
            include: {
              stores: {
                select: { slug: true },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          plan: coupon.plan,
          premiumUntil,
        },
      });

      return created;
    });

    return {
      id: redemption.id,
      couponId: redemption.couponId,
      userId: redemption.userId,
      userEmail: redemption.user.email,
      userName: redemption.user.name ?? '',
      storeSlug: redemption.user.stores[0]?.slug ?? null,
      redeemedAt: redemption.redeemedAt.toISOString(),
      expiresAt: redemption.expiresAt.toISOString(),
    };
  }
}
