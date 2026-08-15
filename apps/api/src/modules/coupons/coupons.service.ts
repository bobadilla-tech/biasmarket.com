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
      include: { coupon: true },
    });

    if (!redemption) {
      throw new NotFoundException('Redemption not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.couponRedemption.delete({ where: { id: redemptionId } });

      // The redemption is what granted premium access. If the user's premium
      // window matches this redemption's grant, reset them back to the base
      // plan. If their premium window has been extended or changed since,
      // leave the current premium state intact.
      const user = await tx.user.findUnique({
        where: { id: redemption.userId },
        select: { plan: true, premiumUntil: true },
      });

      if (
        user &&
        user.plan === 'premium' &&
        user.premiumUntil &&
        user.premiumUntil.getTime() === redemption.expiresAt.getTime()
      ) {
        await tx.user.update({
          where: { id: redemption.userId },
          data: { plan: 'basic', premiumUntil: null },
        });
      }
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

    // All validation that depends on mutable state (maxUses usage, duplicate
    // redemption, premium window) runs inside the transaction so the check
    // reads live state in the same transaction that performs the write —
    // a redemption can't slip past based on a count read before the write
    // began. (This is a guard against the stale pre-transaction read; under
    // Postgres' default READ COMMITTED isolation a fully serialized guarantee
    // would additionally require SERIALIZABLE, not needed for this admin-flow
    // limit.)
    const redemption = await this.prisma.$transaction(async (tx) => {
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

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { premiumUntil: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Stack the new duration on top of any remaining premium time instead of
      // resetting the window from now. If the user already has an active plan
      // (premiumUntil in the future), the new expiry is extended from there;
      // otherwise it runs from the current time.
      const existingUntil = user.premiumUntil;
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
          plan: 'premium',
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
