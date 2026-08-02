import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomerAuthController } from './customer-auth.controller.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { CustomerSessionGuard } from './customer-session.guard.js';
import { OriginGuard } from './origin.guard.js';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerSessionGuard, OriginGuard],
})
export class CustomerAuthModule {}
