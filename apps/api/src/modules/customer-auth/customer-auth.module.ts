import { Module } from '@nestjs/common';
import { CustomerAuthController } from './customer-auth.controller.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { CustomerSessionGuard } from './customer-session.guard.js';

@Module({
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerSessionGuard],
})
export class CustomerAuthModule {}
