import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { ProductSearchController } from './product-search.controller.js';
import { ProductSearchService } from './product-search.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [ProductsController, ProductSearchController],
  providers: [ProductsService, ProductSearchService],
})
export class ProductsModule {}
