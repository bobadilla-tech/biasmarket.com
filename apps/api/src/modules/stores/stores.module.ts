import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { StoresController } from './stores.controller.js';
import { MyStoresController } from './my-stores.controller.js';
import { StoresService } from './stores.service.js';
import { SitemapInternalTokenGuard } from './sitemap-internal-token.guard.js';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  controllers: [StoresController, MyStoresController],
  providers: [StoresService, SitemapInternalTokenGuard],
})
export class StoresModule {}
