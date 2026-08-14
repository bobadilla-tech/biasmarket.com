import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CustomerAuthService } from './customer-auth.service.js';
import { CustomerSessionGuard } from './customer-session.guard.js';
import { OriginGuard } from './origin.guard.js';
import { CustomerSession } from './customer-session.decorator.js';
import { RegisterCustomerDto } from './dto/register-customer.dto.js';
import { LoginCustomerDto } from './dto/login-customer.dto.js';
import { ChangeCustomerPasswordDto } from './dto/change-password.dto.js';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_TTL_MS,
} from './customer-session.constants.js';
import {
  CustomerProfileResponseDto,
  OkResponseDto,
  UpdateCustomerProfileResponseDto,
} from './dto/customer-auth-response.dto.js';
import { toAccountOrderDto } from './dto/account-order-response.dto.js';
import { toOrderDto } from '../orders/infrastructure/order.controller.js';
import type { OrderDetailResponseDto } from '../orders/dto/order-response.dto.js';

function setSessionCookie(res: Response, token: string): void {
  res.cookie(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: CUSTOMER_SESSION_TTL_MS,
    path: '/',
  });
}

@Controller('stores/:slug/account')
export class CustomerAuthController {
  constructor(private customerAuth: CustomerAuthService) {}

  @Public()
  @UseGuards(OriginGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  register(
    @Param('slug') slug: string,
    @Body() dto: RegisterCustomerDto,
  ): Promise<OkResponseDto> {
    return this.customerAuth.register(slug, dto.token, dto.password);
  }

  @Public()
  @UseGuards(OriginGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  async login(
    @Param('slug') slug: string,
    @Body() dto: LoginCustomerDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkResponseDto> {
    const token = await this.customerAuth.login(slug, dto.phone, dto.password);
    setSessionCookie(res, token);
    return { ok: true };
  }

  @Public()
  @UseGuards(OriginGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('forgot-password')
  async forgotPassword(
    @Param('slug') slug: string,
    @Body() dto: ForgotPasswordDto,
  ): Promise<OkResponseDto> {
    await this.customerAuth.forgotPassword(slug, dto.phone);
    return { ok: true };
  }

  // `slug` isn't read by `changePassword` (the customer session already
  // carries `storeId`), but Orval's spec validator needs a declared path
  // parameter for every `{slug}` segment in the route — see
  // docs/plans/2026-08-06-orval-rollout-batches-5-6-plan.md's Batch 5 section
  // for the full story. `@ApiParam` is pure Swagger metadata, zero behavior
  // change; adding an unused `@Param("slug") slug: string` instead was
  // considered and rejected as needless dead code once `@ApiParam` alone was
  // confirmed sufficient (verified by inspecting the regenerated
  // openapi.json's `parameters` for this path).
  @ApiParam({ name: 'slug', type: String })
  @Public()
  @UseGuards(CustomerSessionGuard, OriginGuard)
  @Post('change-password')
  async changePassword(
    @CustomerSession() session: { buyerAccountId: string },
    @Body() dto: ChangeCustomerPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkResponseDto> {
    const token = await this.customerAuth.changePassword(
      session.buyerAccountId,
      dto.currentPassword,
      dto.newPassword,
    );
    setSessionCookie(res, token);
    return { ok: true };
  }

  @Public()
  @UseGuards(CustomerSessionGuard)
  @Get('me')
  async me(
    @Param('slug') slug: string,
    @CustomerSession() session: { buyerAccountId: string },
  ): Promise<CustomerProfileResponseDto> {
    const profile = await this.customerAuth.getProfile(slug, session);
    return {
      customer: profile.customer,
      orders: profile.orders.map(toAccountOrderDto),
    };
  }

  // Reuses `Order`'s own `toOrderDto`/`OrderDetailResponseDto` rather than a
  // buyer-safe subset DTO — confirmed `OrderDetailResponseDto` carries no
  // seller-only/internal fields on top of `OrderResponseDto` (see
  // docs/plans/2026-08-08-buyer-mini-dashboard-plan.md). Ownership is
  // `order.buyerAccountId === session.buyerAccountId`, enforced in
  // `CustomerAuthService.getOrderDetail`.
  @Public()
  @UseGuards(CustomerSessionGuard)
  @Get('orders/:orderId')
  async orderDetail(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
    @CustomerSession() session: { buyerAccountId: string },
  ): Promise<OrderDetailResponseDto> {
    const row = await this.customerAuth.getOrderDetail(slug, session, orderId);
    return toOrderDto(row);
  }

  @Public()
  @UseGuards(CustomerSessionGuard, OriginGuard)
  @Patch('me')
  updateMe(
    @Param('slug') slug: string,
    @CustomerSession() session: { buyerAccountId: string },
    @Body() dto: UpdateCustomerProfileDto,
  ): Promise<UpdateCustomerProfileResponseDto> {
    return this.customerAuth.updateProfile(slug, session, dto);
  }

  // Not in the original plan doc — added because the session-aware header
  // (Phase 12's frontend requirement) needs a way to sign out, and the
  // session cookie is HttpOnly so the frontend can't just clear it itself.
  // No guard needed: logging out an already-invalid/missing session is a
  // harmless no-op, and clearing a cookie carries no meaningful CSRF risk.
  // Same missing-`slug`-parameter spec gap as `changePassword` above (this
  // method never took a `@Param("slug")` either) — same `@ApiParam` fix.
  @ApiParam({ name: 'slug', type: String })
  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): OkResponseDto {
    res.clearCookie(CUSTOMER_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }
}
