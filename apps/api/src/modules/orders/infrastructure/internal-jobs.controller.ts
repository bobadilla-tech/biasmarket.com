import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ExpireOrdersUseCase } from '../application/expire-orders.usecase.js';
import { InternalJobsSecretGuard } from './internal-jobs-secret.guard.js';

// Mounted at /internal/orders/expire-sweep, deliberately outside the global
// "api" prefix (see main.ts's setGlobalPrefix exclude) — reached only by
// apps/workers' repeatable-job dispatcher, never the public API surface.
// Three defense layers, per the migration plan: (1) internal Docker network
// path only — never routed through Caddy to the public domain, (2) a
// Caddy-level block on /internal/* as a backstop, (3) this shared-secret
// guard as the last line of defense. Never documented in the public Swagger
// spec either.
@ApiExcludeController()
@Public()
@UseGuards(ThrottlerGuard, InternalJobsSecretGuard)
@Throttle({ default: { ttl: 60_000, limit: 5 } })
@Controller('internal/orders')
export class InternalJobsController {
  constructor(private expireOrders: ExpireOrdersUseCase) {}

  @HttpCode(200)
  @Post('expire-sweep')
  async expireSweep(): Promise<{ cancelled: number }> {
    return this.expireOrders.execute();
  }
}
