import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { DeviceTokenDto } from './device-token.dto.js';
import { DeviceTokensService } from './device-tokens.service.js';

@Controller('mobile/devices')
@UseGuards(AuthGuard)
export class SellerDeviceTokensController {
  constructor(private readonly tokens: DeviceTokensService) {}

  @Post()
  register(@Session() session: UserSession, @Body() dto: DeviceTokenDto) {
    return this.tokens.register(
      { userId: session.user.id },
      dto.expoPushToken,
      dto.platform,
    );
  }

  @Delete()
  unregister(@Session() session: UserSession, @Body() dto: DeviceTokenDto) {
    return this.tokens.unregister(
      { userId: session.user.id },
      dto.expoPushToken,
    );
  }
}
