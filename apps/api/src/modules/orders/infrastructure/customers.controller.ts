import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { CustomersService } from '../application/customers.service.js';

@Controller('stores/:storeId/customers')
@UseGuards(AuthGuard)
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get()
  findAll(@Param('storeId') storeId: string, @Session() session: UserSession) {
    return this.customers.findAllForStore(storeId, session.user.id);
  }

  @Get(':customerId')
  findOne(
    @Param('storeId') storeId: string,
    @Param('customerId') customerId: string,
    @Session() session: UserSession,
  ) {
    return this.customers.findOneForStore(customerId, storeId, session.user.id);
  }
}
