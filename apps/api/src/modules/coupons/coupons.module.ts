import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { InternalJobsSecretGuard } from '../orders/infrastructure/internal-jobs-secret.guard.js';
import { CouponsController } from './coupons.controller.js';
import { CouponsService } from './coupons.service.js';
import { ExpirePremiumUseCase } from './expire-premium.usecase.js';
import { InternalPremiumJobsController } from './internal-premium-jobs.controller.js';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])],
  providers: [CouponsService, ExpirePremiumUseCase, InternalJobsSecretGuard],
  controllers: [CouponsController, InternalPremiumJobsController],
})
export class CouponsModule {}
