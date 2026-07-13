import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StoresModule } from './modules/stores/stores.module';
import { ProductsModule } from './modules/products/products.module';

@Module({
  imports: [StoresModule, ProductsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
