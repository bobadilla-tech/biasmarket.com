import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { FulfillmentStatus, PaymentStatus } from '@biasmarket/db';
import { OrderRepository } from './order.repository.js';
import { ReviewPaymentUseCase } from '../application/review-payment.usecase.js';
import { AdvanceFulfillmentUseCase } from '../application/advance-fulfillment.usecase.js';
import { ReviewPaymentDto } from '../dto/review-payment.dto.js';
import { AdvanceFulfillmentDto } from '../dto/advance-fulfillment.dto.js';

@Controller('stores/:storeId/orders')
@UseGuards(AuthGuard)
export class OrderController {
  constructor(
    private orders: OrderRepository,
    private reviewPayment: ReviewPaymentUseCase,
    private advanceFulfillment: AdvanceFulfillmentUseCase,
  ) {}

  @Get()
  async findAll(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Query('paymentStatus') paymentStatus: PaymentStatus | undefined,
    @Query('fulfillmentStatus') fulfillmentStatus: FulfillmentStatus | undefined,
  ) {
    await this.orders.assertOwnership(storeId, session.user.id);
    return this.orders.findManyForStore(storeId, { paymentStatus, fulfillmentStatus });
  }

  @Get(':orderId')
  async findOne(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
  ) {
    await this.orders.assertOwnership(storeId, session.user.id);
    return this.orders.findRowByIdForStore(orderId, storeId);
  }

  @Patch(':orderId/review')
  review(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
    @Body() dto: ReviewPaymentDto,
  ) {
    return this.reviewPayment.execute(orderId, storeId, session.user.id, dto.decision);
  }

  @Patch(':orderId/fulfillment')
  advance(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
    @Body() dto: AdvanceFulfillmentDto,
  ) {
    return this.advanceFulfillment.execute(orderId, storeId, session.user.id, dto.status);
  }
}
