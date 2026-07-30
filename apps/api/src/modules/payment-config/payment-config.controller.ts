import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { PaymentConfigService } from './payment-config.service.js';
import { UpsertPaymentMethodDto } from './dto/upsert-payment-method.dto.js';

@Controller('stores/:storeId/payment-methods')
@UseGuards(AuthGuard)
export class PaymentConfigController {
  constructor(private paymentConfig: PaymentConfigService) {}

  @Get()
  findAll(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Query('enabled') enabled?: string,
  ) {
    if (enabled === '1' || enabled === 'true') {
      return this.paymentConfig.findEnabledForStore(storeId, session.user.id);
    }
    return this.paymentConfig.findAllForStore(storeId, session.user.id);
  }

  @Post()
  upsert(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: UpsertPaymentMethodDto,
  ) {
    return this.paymentConfig.upsert(storeId, session.user.id, dto);
  }
}
