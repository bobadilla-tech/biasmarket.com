import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, Roles, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { CouponsService } from "./coupons.service.js";
import {
  type CouponRedemptionResponseDto,
  type CouponResponseDto,
  CreateCouponDto,
  RedeemCouponDto,
} from "./dto/coupon.dto.js";

@Controller()
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @UseGuards(AuthGuard)
  @Roles(["admin"])
  @Post("admin/coupons")
  async createCoupon(
    @Session() session: UserSession,
    @Body() dto: CreateCouponDto,
  ): Promise<CouponResponseDto> {
    return this.coupons.createCoupon(dto, session.user.id);
  }

  @UseGuards(AuthGuard)
  @Roles(["admin"])
  @Get("admin/coupons")
  async listCoupons(): Promise<CouponResponseDto[]> {
    return this.coupons.listCoupons();
  }

  @UseGuards(AuthGuard)
  @Roles(["admin"])
  @Get("admin/coupons/:couponId/redemptions")
  async getRedemptions(
    @Param("couponId") couponId: string,
  ): Promise<CouponRedemptionResponseDto[]> {
    return this.coupons.getRedemptions(couponId);
  }

  @UseGuards(AuthGuard)
  @Post("coupons/redeem")
  async redeemCoupon(
    @Session() session: UserSession,
    @Body() dto: RedeemCouponDto,
  ): Promise<CouponRedemptionResponseDto> {
    return this.coupons.redeemCoupon(dto, session);
  }
}
