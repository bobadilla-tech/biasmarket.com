import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { AppController } from './app.controller.js';
import { StoresModule } from './modules/stores/stores.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SellerAuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    StoresModule,
    ProductsModule,
    PrismaModule,
    UsersModule,
    HealthModule,
    SellerAuthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
