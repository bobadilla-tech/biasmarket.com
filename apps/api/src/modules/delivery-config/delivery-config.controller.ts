import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Public, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { DeliveryConfigService } from './delivery-config.service.js';
import { UpsertDeliveryMethodDto } from './dto/upsert-delivery-method.dto.js';

@Controller('stores/:storeId/delivery-methods')
@UseGuards(AuthGuard)
export class DeliveryConfigController {
  constructor(private deliveryConfig: DeliveryConfigService) {}

  @Get()
  findAll(@Param('storeId') storeId: string, @Session() session: UserSession) {
    return this.deliveryConfig.findAllForStore(storeId, session.user.id);
  }

  @Post()
  upsert(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: UpsertDeliveryMethodDto,
  ) {
    return this.deliveryConfig.upsert(storeId, session.user.id, dto);
  }

  @Delete(':type')
  remove(
    @Param('storeId') storeId: string,
    @Param('type') type: 'PICKUP' | 'COURIER',
    @Session() session: UserSession,
  ) {
    return this.deliveryConfig.remove(storeId, session.user.id, type);
  }
}

@Controller('stores/:slug/public/delivery-methods')
export class PublicDeliveryConfigController {
  constructor(private deliveryConfig: DeliveryConfigService) {}

  @Public()
  @Get()
  findEnabled(@Param('slug') slug: string) {
    return this.deliveryConfig.findEnabledForSlug(slug);
  }
}
