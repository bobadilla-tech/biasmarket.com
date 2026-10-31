import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { InternalJobsSecretGuard } from '../orders/infrastructure/internal-jobs-secret.guard.js';
import { DeviceTokensService } from './device-tokens.service.js';
import { PruneDeviceTokenDto } from './prune-device-token.dto.js';

@ApiExcludeController()
@Public()
@UseGuards(ThrottlerGuard, InternalJobsSecretGuard)
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@Controller('internal/device-tokens')
export class InternalDeviceTokensController {
  constructor(private readonly tokens: DeviceTokensService) {}

  @HttpCode(200)
  @Post('prune')
  prune(@Body() dto: PruneDeviceTokenDto) {
    return this.tokens.removeInvalidToken(dto.expoPushToken);
  }
}
