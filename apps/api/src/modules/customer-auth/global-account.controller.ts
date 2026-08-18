import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '@thallesp/nestjs-better-auth';
import { CustomerAuthService } from './customer-auth.service.js';
import { CustomerSessionGuard } from './customer-session.guard.js';
import { CustomerSession } from './customer-session.decorator.js';
import {
  GlobalAccountOrderResponseDto,
  GlobalAccountProfileResponseDto,
} from './dto/global-account-response.dto.js';

// Slug-independent — the buyer identity is global, so these routes don't
// live under `stores/:slug/account` like the rest of the module. See
// docs/plans/2026-08-08-global-buyer-account-plan.md's "New cross-store
// endpoints". Not wired into the storefront frontend yet (no global
// nav-bar "logged in as X" indicator in this pass — that's a follow-up),
// but the API surface is real and covered by the e2e cross-store test.
@Controller('account')
export class GlobalAccountController {
  constructor(private customerAuth: CustomerAuthService) {}

  @Public()
  @UseGuards(CustomerSessionGuard)
  @Get('me')
  me(
    @CustomerSession() session: { buyerAccountId: string },
  ): Promise<GlobalAccountProfileResponseDto> {
    return this.customerAuth.getGlobalProfile(session.buyerAccountId);
  }

  @Public()
  @UseGuards(CustomerSessionGuard)
  @Get('orders')
  async orders(
    @CustomerSession() session: { buyerAccountId: string },
  ): Promise<GlobalAccountOrderResponseDto[]> {
    return this.customerAuth.getGlobalOrders(session.buyerAccountId);
  }
}
