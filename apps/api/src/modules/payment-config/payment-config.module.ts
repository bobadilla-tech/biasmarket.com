import { Module } from '@nestjs/common';
import {
  PaymentConfigController,
  PublicPaymentConfigController,
} from './payment-config.controller.js';
import { PaymentConfigService } from './payment-config.service.js';

@Module({
  controllers: [PaymentConfigController, PublicPaymentConfigController],
  providers: [PaymentConfigService],
  exports: [PaymentConfigService],
})
export class PaymentConfigModule {}
