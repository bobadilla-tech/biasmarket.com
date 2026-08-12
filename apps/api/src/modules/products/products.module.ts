import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { ProductSearchController } from './product-search.controller.js';
import { ProductSearchService } from './product-search.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [
    NotificationsModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  ],
  controllers: [ProductsController, ProductSearchController],
  providers: [ProductsService, ProductSearchService],
})
export class ProductsModule {}
