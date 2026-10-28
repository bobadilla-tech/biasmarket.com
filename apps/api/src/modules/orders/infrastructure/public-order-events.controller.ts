import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  StreamableFile,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
} from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OrderEventsService } from '../application/order-events.service.js';
import { PublicOrderService } from '../application/public-order.service.js';
import { RecordInviteEventDto } from '../dto/record-invite-event.dto.js';
import { ReceiptConfirmedResponseDto } from '../dto/receipt-confirmed-response.dto.js';
import { PublicOrderResponseDto } from '../dto/public-order-response.dto.js';
import { StorageService } from '../../../storage/storage.service.js';

@Controller('public/orders')
export class PublicOrderEventsController {
  constructor(
    private events: OrderEventsService,
    private orders: PublicOrderService,
    private storage: StorageService,
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
  @Get(':token/packed-photo')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiProduces('image/jpeg', 'image/png')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async getPackedPhoto(@Param('token') token: string): Promise<StreamableFile> {
    const imageUrl = await this.orders.getPackedPhotoUrlByToken(token);
    const { body, contentType } =
      await this.storage.getPaymentImageStream(imageUrl);
    return new StreamableFile(body, { type: contentType });
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

  @Public()
  @Post(':token/receipt')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @HttpCode(200)
  @ApiOkResponse({ type: ReceiptConfirmedResponseDto })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async confirmReceipt(
    @Param('token') token: string,
    @Headers('content-type') contentType: string | undefined,
  ): Promise<ReceiptConfirmedResponseDto> {
    // Same JSON-only rule as `events`: a cross-site form post is urlencoded.
    if (!contentType?.toLowerCase().startsWith('application/json')) {
      throw new UnsupportedMediaTypeException();
    }
    return this.events.confirmReceipt(token);
  }
}
