import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CouponsController } from './coupons.controller.js';
import { CouponsService } from './coupons.service.js';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])],
  providers: [CouponsService],
  controllers: [CouponsController],
})
export class CouponsModule {}
