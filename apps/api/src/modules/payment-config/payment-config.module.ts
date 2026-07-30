import { Module } from '@nestjs/common';
import { PaymentConfigController } from './payment-config.controller.js';
import { PaymentConfigService } from './payment-config.service.js';

@Module({
  controllers: [PaymentConfigController],
  providers: [PaymentConfigService],
  exports: [PaymentConfigService],
})
export class PaymentConfigModule {}
