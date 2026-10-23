import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OrderEventsService } from '../application/order-events.service.js';
import { PublicOrderService } from '../application/public-order.service.js';
import { RecordInviteEventDto } from '../dto/record-invite-event.dto.js';

@Controller('public/orders')
export class PublicOrderEventsController {
  constructor(
    private events: OrderEventsService,
    private orders: PublicOrderService,
  ) {}

  @Public()
  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async getByToken(@Param('token') token: string) {
    return this.orders.getByToken(token);
  }

  @Public()
  @Post(':token/events')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @HttpCode(204)
  @ApiNoContentResponse()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async recordInvite(
    @Param('token') token: string,
    @Body() dto: RecordInviteEventDto,
  ): Promise<void> {
    await this.events.recordInvite(token, dto.type);
  }
}
