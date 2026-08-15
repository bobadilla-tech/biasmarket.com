import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringService } from './monitoring.service.js';
import { MonitoringWebhookSecretGuard } from './monitoring-webhook-secret.guard.js';

@Module({
  // Limit set higher than the 5/min used by ContactModule since Kuma may
  // fire several monitors' events in a burst.
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }])],
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringWebhookSecretGuard],
})
export class MonitoringModule {}
