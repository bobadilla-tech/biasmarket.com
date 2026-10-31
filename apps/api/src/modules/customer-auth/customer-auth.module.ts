import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { OrdersModule } from '../orders/orders.module.js';
import { CustomerAuthController } from './customer-auth.controller.js';
import { GlobalAccountController } from './global-account.controller.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { CustomerSessionGuard } from './customer-session.guard.js';
import { OriginGuard } from './origin.guard.js';
import { CustomerDeviceTokensController } from './customer-device-tokens.controller.js';
import { DeviceTokensModule } from '../device-tokens/device-tokens.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    OrdersModule,
    DeviceTokensModule,
  ],
  controllers: [
    CustomerAuthController,
    GlobalAccountController,
    CustomerDeviceTokensController,
  ],
  providers: [CustomerAuthService, CustomerSessionGuard, OriginGuard],
})
export class CustomerAuthModule {}
