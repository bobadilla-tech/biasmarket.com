import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { RestockController } from "./restock.controller.js";
import { RestockService } from "./restock.service.js";

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])],
  controllers: [RestockController],
  providers: [RestockService],
})
export class RestockModule {}
