import { Module } from '@nestjs/common';
import { OrderController } from './infrastructure/order.controller.js';
import { CheckoutController } from './infrastructure/checkout.controller.js';
import { OrderRepository } from './infrastructure/order.repository.js';
import { CreateOrderUseCase } from './application/create-order.usecase.js';
import { ReviewPaymentUseCase } from './application/review-payment.usecase.js';
import { AdvanceFulfillmentUseCase } from './application/advance-fulfillment.usecase.js';
import { ExpireOrdersUseCase } from './application/expire-orders.usecase.js';
import { OrdersCronService } from './application/orders-cron.service.js';

@Module({
  controllers: [OrderController, CheckoutController],
  providers: [
    OrderRepository,
    CreateOrderUseCase,
    ReviewPaymentUseCase,
    AdvanceFulfillmentUseCase,
    ExpireOrdersUseCase,
    OrdersCronService,
  ],
})
export class OrdersModule {}
