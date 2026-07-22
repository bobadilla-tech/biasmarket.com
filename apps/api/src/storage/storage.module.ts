import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
