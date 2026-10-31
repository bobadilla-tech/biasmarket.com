import { Module } from '@nestjs/common';
import { SellerDeviceTokensController } from './device-tokens.controller.js';
import { DeviceTokensService } from './device-tokens.service.js';
import { InternalDeviceTokensController } from './internal-device-tokens.controller.js';

@Module({
  controllers: [SellerDeviceTokensController, InternalDeviceTokensController],
  providers: [DeviceTokensService],
  exports: [DeviceTokensService],
})
export class DeviceTokensModule {}
