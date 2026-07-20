import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module.js';
import { AppController } from './app.controller.js';
import { StoresModule } from './modules/stores/stores.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SellerAuthModule } from './auth/auth.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { DeliveryConfigModule } from './modules/delivery-config/delivery-config.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    StoresModule,
    ProductsModule,
    PrismaModule,
    UsersModule,
    HealthModule,
    SellerAuthModule,
    OrdersModule,
    DeliveryConfigModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
