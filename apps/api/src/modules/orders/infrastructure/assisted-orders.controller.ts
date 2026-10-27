import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SellerThrottlerGuard } from '../../../common/guards/seller-throttler.guard.js';
import { CreateAssistedOrderUseCase } from '../application/create-assisted-order.usecase.js';
import { CreateAssistedOrderDto } from '../dto/create-assisted-order.dto.js';
import { CreateAssistedOrderResponseDto } from '../dto/assisted-order-response.dto.js';
import { OrderRepository } from './order.repository.js';
import { toCheckoutOrderDto } from './checkout.controller.js';

// Grouped with the seller order endpoints in the generated SDK.
@ApiTags('Order')
@Controller('stores/:storeId/orders/assisted')
@UseGuards(AuthGuard)
export class AssistedOrdersController {
  constructor(
    private orders: OrderRepository,
    private createAssistedOrder: CreateAssistedOrderUseCase,
  ) {}

  @Post()
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
}
