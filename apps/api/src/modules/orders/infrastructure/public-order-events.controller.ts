import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OrderEventsService } from '../application/order-events.service.js';
import { RecordInviteEventDto } from '../dto/record-invite-event.dto.js';

@Controller('public/orders')
export class PublicOrderEventsController {
  constructor(private events: OrderEventsService) {}

  @Public()
  @Post(':token/events')
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
