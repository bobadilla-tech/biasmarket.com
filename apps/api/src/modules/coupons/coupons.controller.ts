import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CouponsService } from './coupons.service.js';
import {
  type CouponRedemptionResponseDto,
  type CouponResponseDto,
  CreateCouponDto,
  RedeemCouponDto,
  UpdateCouponDto,
} from './dto/coupon.dto.js';

@Controller()
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @UseGuards(AuthGuard)
  @Roles(['admin'])
  @Post('admin/coupons')
  async createCoupon(
    @Session() session: UserSession,
    @Body() dto: CreateCouponDto,
  ): Promise<CouponResponseDto> {
    return this.coupons.createCoupon(dto, session.user.id);
  }

  @UseGuards(AuthGuard)
  @Roles(['admin'])
  @Get('admin/coupons')
  async listCoupons(): Promise<CouponResponseDto[]> {
    return this.coupons.listCoupons();
  }

  @UseGuards(AuthGuard)
  @Roles(['admin'])
  @Get('admin/coupons/:couponId/redemptions')
  async getRedemptions(
    @Param('couponId') couponId: string,
  ): Promise<CouponRedemptionResponseDto[]> {
    return this.coupons.getRedemptions(couponId);
  }

  @UseGuards(AuthGuard)
  @Roles(['admin'])
  @Patch('admin/coupons/:couponId')
  async updateCoupon(
    @Param('couponId') couponId: string,
    @Body() dto: UpdateCouponDto,
  ): Promise<CouponResponseDto> {
    return this.coupons.updateCoupon(couponId, dto);
  }

  @UseGuards(AuthGuard)
  @Roles(['admin'])
  @Delete('admin/coupons/:couponId')
  async deleteCoupon(
    @Param('couponId') couponId: string,
  ): Promise<{ deleted: boolean }> {
    return this.coupons.deleteCoupon(couponId);
  }

  @UseGuards(AuthGuard)
  @Roles(['admin'])
  @Patch('admin/coupons/:couponId/status')
  async toggleCouponStatus(
    @Param('couponId') couponId: string,
  ): Promise<CouponResponseDto> {
    return this.coupons.toggleCouponStatus(couponId);
  }

  @UseGuards(AuthGuard)
  @Roles(['admin'])
  @Post('admin/coupons/:couponId/redemptions/:redemptionId/unredeem')
  async unredeemCoupon(
    @Param('couponId') couponId: string,
    @Param('redemptionId') redemptionId: string,
  ): Promise<{ unredeemed: boolean }> {
    return this.coupons.unredeemCoupon(couponId, redemptionId);
  }

  @UseGuards(AuthGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('coupons/redeem')
  async redeemCoupon(
    @Session() session: UserSession,
    @Body() dto: RedeemCouponDto,
  ): Promise<CouponRedemptionResponseDto> {
    return this.coupons.redeemCoupon(dto, session);
  }
}
