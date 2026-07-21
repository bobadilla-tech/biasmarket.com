import { Module } from '@nestjs/common';
import { StoresController } from './stores.controller.js';
import { MyStoresController } from './my-stores.controller.js';
import { StoresService } from './stores.service.js';
import { StorageService } from '../../storage/storage.service.js';




@Module({
  controllers: [StoresController,MyStoresController],
  providers: [StoresService,StorageService],
})
export class StoresModule {}
