import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StoresModule } from './modules/stores/stores.module';
import { ProductsModule } from './modules/products/products.module';
import { UsersModule } from './modules/users/users.module';
import { SellerAuthModule } from './auth/auth.module';

@Module({
  imports: [
    StoresModule,
    ProductsModule,
    PrismaModule,
    UsersModule,
    SellerAuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
