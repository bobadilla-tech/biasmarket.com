import { Module } from '@nestjs/common';
import { SellerDeviceTokensController } from './device-tokens.controller.js';
import { DeviceTokensService } from './device-tokens.service.js';

@Module({
  controllers: [SellerDeviceTokensController],
  providers: [DeviceTokensService],
  exports: [DeviceTokensService],
})
export class DeviceTokensModule {}
