import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { PrismaService } from "../../prisma/prisma.service.js";
import type {
  CouponRedemptionResponseDto,
  CouponResponseDto,
  CreateCouponDto,
  RedeemCouponDto,
} from "./dto/coupon.dto.js";

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCoupon(
    dto: CreateCouponDto,
    adminUserId?: string,
  ): Promise<CouponResponseDto> {
    const code = normalizeCode(dto.code);

    if (!code) {
      throw new BadRequestException("Coupon code is required");
    }

    const existing = await this.prisma.coupon.findUnique({
      where: { code },
    });

    if (existing) {
      throw new BadRequestException("Coupon code already exists");
    }

    if (dto.durationDays <= 0) {
      throw new BadRequestException("durationDays must be greater than 0");
    }

    if (dto.maxUses <= 0) {
      throw new BadRequestException("maxUses must be greater than 0");
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        name: dto.name,
        description: dto.description ?? "",
        plan: dto.plan ?? "premium",
        durationDays: dto.durationDays,
        maxUses: dto.maxUses,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: adminUserId ?? null,
      },
    });

    return {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      plan: coupon.plan,
      durationDays: coupon.durationDays,
      maxUses: coupon.maxUses,
      isActive: coupon.isActive,
      startsAt: coupon.startsAt?.toISOString() ?? null,
      expiresAt: coupon.expiresAt?.toISOString() ?? null,
      createdAt: coupon.createdAt.toISOString(),
      updatedAt: coupon.updatedAt.toISOString(),
      redemptionCount: 0,
    };
  }

  async listCoupons(): Promise<CouponResponseDto[]> {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { redemptions: true } },
      },
    });

    return coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      plan: coupon.plan,
      durationDays: coupon.durationDays,
      maxUses: coupon.maxUses,
      isActive: coupon.isActive,
      startsAt: coupon.startsAt?.toISOString() ?? null,
      expiresAt: coupon.expiresAt?.toISOString() ?? null,
      createdAt: coupon.createdAt.toISOString(),
      updatedAt: coupon.updatedAt.toISOString(),
      redemptionCount: coupon._count.redemptions,
    }));
  }

  async getRedemptions(
    couponId: string,
  ): Promise<CouponRedemptionResponseDto[]> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
    });

    if (!coupon) {
      throw new NotFoundException("Coupon not found");
    }

    const rows = await this.prisma.couponRedemption.findMany({
      where: { couponId },
      include: { user: true },
      orderBy: { redeemedAt: "desc" },
    });

    return rows.map((row) => ({
      id: row.id,
      couponId: row.couponId,
      userId: row.userId,
      userEmail: row.user.email,
      userName: row.user.name ?? "",
      redeemedAt: row.redeemedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  async redeemCoupon(
    dto: RedeemCouponDto,
    session: UserSession,
  ): Promise<CouponRedemptionResponseDto> {
    const code = normalizeCode(dto.code);
    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
      include: { redemptions: true },
    });

    if (!coupon) {
      throw new NotFoundException("Coupon not found");
    }

    if (!coupon.isActive) {
      throw new BadRequestException("Coupon is inactive");
    }

    const now = new Date();

    if (coupon.startsAt && now < coupon.startsAt) {
      throw new BadRequestException("Coupon is not available yet");
    }

    if (coupon.expiresAt && now > coupon.expiresAt) {
      throw new BadRequestException("Coupon has expired");
    }

    const userId = session.user.id;
    const existingRedemption = await this.prisma.couponRedemption.findUnique({
      where: { couponId_userId: { couponId: coupon.id, userId } },
    });

    if (existingRedemption) {
      throw new BadRequestException("This user already redeemed this coupon");
    }

    if (coupon.redemptions.length >= coupon.maxUses) {
      throw new BadRequestException("Coupon has reached its maximum uses");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { premiumUntil: true },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const premiumUntil = new Date(
      now.getTime() + coupon.durationDays * 24 * 60 * 60 * 1000,
    );

    const redemption = await this.prisma.$transaction(async (tx) => {
      const created = await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId,
          expiresAt: premiumUntil,
        },
        include: { user: true },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          plan: "premium",
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
      userName: redemption.user.name ?? "",
      redeemedAt: redemption.redeemedAt.toISOString(),
      expiresAt: redemption.expiresAt.toISOString(),
    };
  }
}
