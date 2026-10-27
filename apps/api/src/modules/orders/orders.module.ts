import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { OrderController } from './infrastructure/order.controller.js';
import { AssistedOrdersController } from './infrastructure/assisted-orders.controller.js';
import { CheckoutController } from './infrastructure/checkout.controller.js';
import { CustomerAccountController } from './infrastructure/customer-account.controller.js';
import { CustomersController } from './infrastructure/customers.controller.js';
import { CustomerOrderPaymentsController } from './infrastructure/customer-order-payments.controller.js';
import { InternalJobsController } from './infrastructure/internal-jobs.controller.js';
import { InternalJobsSecretGuard } from './infrastructure/internal-jobs-secret.guard.js';
import { OrderRepository } from './infrastructure/order.repository.js';
import { CustomersService } from './application/customers.service.js';
import { CreateOrderUseCase } from './application/create-order.usecase.js';
import { CreateAssistedOrderUseCase } from './application/create-assisted-order.usecase.js';
import { ManageAssistedOrderLinkUseCase } from './application/manage-assisted-order-link.usecase.js';
import { ReviewPaymentUseCase } from './application/review-payment.usecase.js';
import { AdvanceFulfillmentUseCase } from './application/advance-fulfillment.usecase.js';
import { CancelOrderUseCase } from './application/cancel-order.usecase.js';
import { ExpireOrdersUseCase } from './application/expire-orders.usecase.js';
import { CustomerAccountService } from './application/customer-account.service.js';
import { OrderEventsService } from './application/order-events.service.js';
import { PublicOrderService } from './application/public-order.service.js';
import { PublicOrderEventsController } from './infrastructure/public-order-events.controller.js';
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
    AssistedOrdersController,
    CheckoutController,
    CustomerAccountController,
    CustomersController,
    CustomerOrderPaymentsController,
    InternalJobsController,
    PublicOrderEventsController,
  ],
  providers: [
    OrderRepository,
    CreateOrderUseCase,
    CreateAssistedOrderUseCase,
    ManageAssistedOrderLinkUseCase,
    ReviewPaymentUseCase,
    AdvanceFulfillmentUseCase,
    CancelOrderUseCase,
    ExpireOrdersUseCase,
    InternalJobsSecretGuard,
    CustomerAccountService,
    CustomersService,
    OrderEventsService,
    PublicOrderService,
  ],
  exports: [CustomerAccountService, OrderRepository],
})
export class OrdersModule {}
