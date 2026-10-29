import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CustomerAuthService } from './customer-auth.service.js';
import { CustomerSessionGuard } from './customer-session.guard.js';
import { CustomerSession } from './customer-session.decorator.js';
import { AllowNoOrigin, OriginGuard } from './origin.guard.js';
import { LoginCustomerDto } from './dto/login-customer.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { RegisterCustomerDto } from './dto/register-customer.dto.js';
import { OkResponseDto } from './dto/customer-auth-response.dto.js';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_TTL_MS,
} from './customer-session.constants.js';
import {
  GlobalAccountOrderDetailResponseDto,
  GlobalAccountOrderResponseDto,
  GlobalAccountProfileResponseDto,
} from './dto/global-account-response.dto.js';

// Slug-independent — the buyer identity is global, so these routes don't
// live under `stores/:slug/account` like the rest of the module. See
// .artifacts/2026/08/20260808--global-buyer-account/plan.md's "New cross-store
// endpoints". Not wired into the storefront frontend yet (no global
// nav-bar "logged in as X" indicator in this pass — that's a follow-up),
// but the API surface is real and covered by the e2e cross-store test.
@Controller('account')
export class GlobalAccountController {
  constructor(private customerAuth: CustomerAuthService) {}

  @Public()
  @ApiBearerAuth('bearer')
  @UseGuards(CustomerSessionGuard)
  @Get('me')
  me(
    @CustomerSession() session: { buyerAccountId: string },
  ): Promise<GlobalAccountProfileResponseDto> {
    return this.customerAuth.getGlobalProfile(session.buyerAccountId);
  }

  @Public()
  @ApiBearerAuth('bearer')
  @UseGuards(CustomerSessionGuard)
  @Get('orders')
  async orders(
    @CustomerSession() session: { buyerAccountId: string },
  ): Promise<GlobalAccountOrderResponseDto[]> {
    return this.customerAuth.getGlobalOrders(session.buyerAccountId);
  }

  @Public()
  @ApiBearerAuth('bearer')
  @UseGuards(CustomerSessionGuard)
  @Get('orders/:orderId')
  orderDetail(
    @Param('orderId') orderId: string,
    @CustomerSession() session: { buyerAccountId: string },
  ): Promise<GlobalAccountOrderDetailResponseDto> {
    return this.customerAuth.getGlobalOrderDetail(
      session.buyerAccountId,
      orderId,
    ) as Promise<GlobalAccountOrderDetailResponseDto>;
  }

  // Global (no-store) phone + password login, for the My purchases page. Same
  // credentials and cookie as the per-store login; it just doesn't link a store.
  @Public()
  @AllowNoOrigin()
  @UseGuards(OriginGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  async login(
    @Body() dto: LoginCustomerDto,
    @Headers('x-client') client: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkResponseDto> {
    const token = await this.customerAuth.loginGlobal(dto.phone, dto.password);
    res.cookie(CUSTOMER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: CUSTOMER_SESSION_TTL_MS,
      path: '/',
    });
    return client === 'mobile'
      ? { ok: true, sessionToken: token }
      : { ok: true };
  }

  // Same reasoning as the per-store logout: clearing a cookie needs no guard.
  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): OkResponseDto {
    res.clearCookie(CUSTOMER_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Public()
  @AllowNoOrigin()
  @UseGuards(OriginGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<OkResponseDto> {
    await this.customerAuth.forgotPasswordGlobal(dto.phone);
    return { ok: true };
  }

  // Redeems the emailed token from the global forgot-password flow.
  @Public()
  @AllowNoOrigin()
  @UseGuards(OriginGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('reset-password')
  resetPassword(@Body() dto: RegisterCustomerDto): Promise<OkResponseDto> {
    return this.customerAuth.resetPasswordGlobal(dto.token, dto.password);
  }
}
