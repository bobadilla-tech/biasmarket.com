import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { Public } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { CustomerAuthService } from './customer-auth.service.js';
import { CustomerSessionGuard } from './customer-session.guard.js';
import { CustomerSession } from './customer-session.decorator.js';
import { RegisterCustomerDto } from './dto/register-customer.dto.js';
import { LoginCustomerDto } from './dto/login-customer.dto.js';
import { ChangeCustomerPasswordDto } from './dto/change-password.dto.js';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto.js';
import { CUSTOMER_SESSION_COOKIE, CUSTOMER_SESSION_TTL_MS } from './customer-session.constants.js';

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
  @Post('register')
  register(@Param('slug') slug: string, @Body() dto: RegisterCustomerDto) {
    return this.customerAuth.register(slug, dto.token, dto.password);
  }

  @Public()
  @Post('login')
  async login(
    @Param('slug') slug: string,
    @Body() dto: LoginCustomerDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.customerAuth.login(slug, dto.phone, dto.password);
    setSessionCookie(res, token);
    return { ok: true };
  }

  @Public()
  @UseGuards(CustomerSessionGuard)
  @Post('change-password')
  async changePassword(
    @CustomerSession() session: { id: string; storeId: string },
    @Body() dto: ChangeCustomerPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.customerAuth.changePassword(
      session.id,
      dto.currentPassword,
      dto.newPassword,
    );
    setSessionCookie(res, token);
    return { ok: true };
  }

  @Public()
  @UseGuards(CustomerSessionGuard)
  @Get('me')
  me(@Param('slug') slug: string, @CustomerSession() session: { id: string; storeId: string }) {
    return this.customerAuth.getProfile(slug, session);
  }

  @Public()
  @UseGuards(CustomerSessionGuard)
  @Patch('me')
  updateMe(
    @Param('slug') slug: string,
    @CustomerSession() session: { id: string; storeId: string },
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.customerAuth.updateProfile(slug, session, dto.name);
  }
}
