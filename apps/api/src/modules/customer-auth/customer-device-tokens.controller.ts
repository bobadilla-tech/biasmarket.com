import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { CustomerSession } from './customer-session.decorator.js';
import { CustomerSessionGuard } from './customer-session.guard.js';
import { DeviceTokenDto } from '../device-tokens/device-token.dto.js';
import { DeviceTokensService } from '../device-tokens/device-tokens.service.js';

@Controller('stores/:slug/account/devices')
@Public()
@ApiBearerAuth('bearer')
@UseGuards(CustomerSessionGuard)
export class CustomerDeviceTokensController {
  constructor(private readonly tokens: DeviceTokensService) {}

  @Post()
  register(
    @CustomerSession() session: { buyerAccountId: string },
    @Body() dto: DeviceTokenDto,
  ) {
    return this.tokens.register(
      { buyerAccountId: session.buyerAccountId },
      dto.expoPushToken,
      dto.platform,
    );
  }

  @Delete()
  unregister(
    @CustomerSession() session: { buyerAccountId: string },
    @Body() dto: DeviceTokenDto,
  ) {
    return this.tokens.unregister(
      { buyerAccountId: session.buyerAccountId },
      dto.expoPushToken,
    );
  }
}
