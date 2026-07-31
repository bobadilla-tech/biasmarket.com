import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '@thallesp/nestjs-better-auth';
import { CustomerAccountService } from '../application/customer-account.service.js';

@Controller('stores/:slug/account')
export class CustomerAccountController {
  constructor(private customerAccounts: CustomerAccountService) {}

  @Public()
  @Get('confirm')
  confirm(@Param('slug') slug: string, @Query('token') token: string | undefined) {
    return this.customerAccounts.confirmAccount(slug, token);
  }
}
