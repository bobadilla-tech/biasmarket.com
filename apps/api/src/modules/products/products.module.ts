import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { StorageService } from '../../storage/storage.service.js';


@Module({
  controllers: [ProductsController],
  providers: [ProductsService,StorageService],
})
export class ProductsModule {}
