import { Module } from '@nestjs/common';
import { StoreSectionsController } from './store-sections.controller.js';
import { StoreSectionsService } from './store-sections.service.js';

@Module({
  controllers: [StoreSectionsController],
  providers: [StoreSectionsService],
  exports: [StoreSectionsService],
})
export class StoreSectionsModule {}
