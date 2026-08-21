import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { OrderController } from './infrastructure/order.controller.js';
import { CheckoutController } from './infrastructure/checkout.controller.js';
import { CustomerAccountController } from './infrastructure/customer-account.controller.js';
import { CustomersController } from './infrastructure/customers.controller.js';
import { CustomerOrderPaymentsController } from './infrastructure/customer-order-payments.controller.js';
import { InternalJobsController } from './infrastructure/internal-jobs.controller.js';
import { InternalJobsSecretGuard } from './infrastructure/internal-jobs-secret.guard.js';
import { OrderRepository } from './infrastructure/order.repository.js';
import { CustomersService } from './application/customers.service.js';
import { CreateOrderUseCase } from './application/create-order.usecase.js';
import { ReviewPaymentUseCase } from './application/review-payment.usecase.js';
import { AdvanceFulfillmentUseCase } from './application/advance-fulfillment.usecase.js';
import { CancelOrderUseCase } from './application/cancel-order.usecase.js';
import { ExpireOrdersUseCase } from './application/expire-orders.usecase.js';
import { CustomerAccountService } from './application/customer-account.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentConfigModule } from '../payment-config/payment-config.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    NotificationsModule,
    PaymentConfigModule,
  ],
  controllers: [
    OrderController,
    CheckoutController,
    CustomerAccountController,
    CustomersController,
    CustomerOrderPaymentsController,
    InternalJobsController,
  ],
  providers: [
    OrderRepository,
    CreateOrderUseCase,
    ReviewPaymentUseCase,
    AdvanceFulfillmentUseCase,
    CancelOrderUseCase,
    ExpireOrdersUseCase,
    InternalJobsSecretGuard,
    CustomerAccountService,
    CustomersService,
  ],
  exports: [CustomerAccountService, OrderRepository],
})
export class OrdersModule {}
