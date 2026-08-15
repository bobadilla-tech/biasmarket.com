import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { InternalJobsSecretGuard } from '../orders/infrastructure/internal-jobs-secret.guard.js';
import { ExpirePremiumUseCase } from './expire-premium.usecase.js';

// Mounted at /internal/premium/expire-sweep, deliberately outside the
// global "api" prefix (see main.ts's setGlobalPrefix exclude) — reached
// only by apps/workers' repeatable-job dispatcher, same three-layer defense
// as orders/infrastructure/internal-jobs.controller.ts (internal Docker
// network path only, Caddy /internal/* block, this shared-secret guard).
@ApiExcludeController()
@Public()
@UseGuards(ThrottlerGuard, InternalJobsSecretGuard)
@Throttle({ default: { ttl: 60_000, limit: 5 } })
@Controller('internal/premium')
export class InternalPremiumJobsController {
  constructor(private readonly expirePremium: ExpirePremiumUseCase) {}

  @HttpCode(200)
  @Post('expire-sweep')
  async expireSweep(): Promise<{ expired: number }> {
    return this.expirePremium.execute();
  }
}
