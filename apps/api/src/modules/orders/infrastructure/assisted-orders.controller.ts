import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SellerThrottlerGuard } from '../../../common/guards/seller-throttler.guard.js';
import { CreateAssistedOrderUseCase } from '../application/create-assisted-order.usecase.js';
import { ManageAssistedOrderLinkUseCase } from '../application/manage-assisted-order-link.usecase.js';
import { CorrectBuyerPhoneDto } from '../dto/correct-buyer-phone.dto.js';
import { CreateAssistedOrderDto } from '../dto/create-assisted-order.dto.js';
import {
  AssistedOrderLinkResponseDto,
  CreateAssistedOrderResponseDto,
} from '../dto/assisted-order-response.dto.js';
import { OrderRepository } from './order.repository.js';
import { toCheckoutOrderDto } from './checkout.controller.js';
import { toOrderDto } from './order.controller.js';

// Grouped with the seller order endpoints in the generated SDK.
@ApiTags('Order')
@Controller('stores/:storeId/orders')
@UseGuards(AuthGuard)
export class AssistedOrdersController {
  constructor(
    private orders: OrderRepository,
    private createAssistedOrder: CreateAssistedOrderUseCase,
    private manageLink: ManageAssistedOrderLinkUseCase,
  ) {}

  @Post('assisted')
  @UseGuards(SellerThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async createAssisted(
    @Param('storeId') storeId: string,
    @Body() dto: CreateAssistedOrderDto,
    @Session() session: UserSession,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateAssistedOrderResponseDto> {
    const store = await this.orders.assertOwnership(storeId, session.user.id);
    const { order, accessUrl, previousOrders } =
      await this.createAssistedOrder.execute(store, session.user.id, dto);
    // The response carries the only copy of the private link.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return { order: toCheckoutOrderDto(order), accessUrl, previousOrders };
  }

  // Rotates the private link: the previous one stops working at once.
  @Post(':orderId/access-link')
  @UseGuards(SellerThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async regenerateAccessLink(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AssistedOrderLinkResponseDto> {
    const store = await this.orders.assertOwnership(storeId, session.user.id);
    const { accessUrl } = await this.manageLink.regenerate(
      store,
      session.user.id,
      orderId,
    );
    return this.linkResponse(res, storeId, orderId, accessUrl);
  }

  // Fixes a wrong number before the buyer opened or claimed the link; rotates
  // the link too, since the old one was sent to the wrong person.
  @Patch(':orderId/buyer-phone')
  @UseGuards(SellerThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async correctBuyerPhone(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CorrectBuyerPhoneDto,
    @Session() session: UserSession,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AssistedOrderLinkResponseDto> {
    const store = await this.orders.assertOwnership(storeId, session.user.id);
    const { accessUrl } = await this.manageLink.correctPhone(
      store,
      session.user.id,
      orderId,
      dto.customerPhone,
    );
    return this.linkResponse(res, storeId, orderId, accessUrl);
  }

  private async linkResponse(
    res: Response,
    storeId: string,
    orderId: string,
    accessUrl: string,
  ): Promise<AssistedOrderLinkResponseDto> {
    const row = await this.orders.findRowByIdForStore(orderId, storeId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return { order: toOrderDto(row), accessUrl };
  }
}
