import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OrderEventsService } from '../application/order-events.service.js';
import { PublicOrderService } from '../application/public-order.service.js';
import { RecordInviteEventDto } from '../dto/record-invite-event.dto.js';
import { PublicOrderResponseDto } from '../dto/public-order-response.dto.js';

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
  @ApiOkResponse({ type: PublicOrderResponseDto })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async getByToken(
    @Param('token') token: string,
  ): Promise<PublicOrderResponseDto> {
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
    @Headers('content-type') contentType: string | undefined,
    @Body() dto: RecordInviteEventDto,
  ): Promise<void> {
    // The beacon is JSON. urlencoded posts would otherwise validate and
    // write an event, because the global body parser accepts both.
    if (!contentType?.toLowerCase().startsWith('application/json')) {
      throw new UnsupportedMediaTypeException();
    }
    await this.events.recordInvite(token, dto.type);
  }
}
