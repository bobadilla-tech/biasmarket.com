import { Module } from '@nestjs/common';
import {
  DeliveryConfigController,
  PublicDeliveryConfigController,
} from './delivery-config.controller.js';
import { DeliveryConfigService } from './delivery-config.service.js';

@Module({
  controllers: [DeliveryConfigController, PublicDeliveryConfigController],
  providers: [DeliveryConfigService],
  exports: [DeliveryConfigService],
})
export class DeliveryConfigModule {}
