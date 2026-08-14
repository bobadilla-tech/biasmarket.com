import { Module } from "@nestjs/common";
import { CouponsController } from "./coupons.controller.js";
import { CouponsService } from "./coupons.service.js";

@Module({
  providers: [CouponsService],
  controllers: [CouponsController],
})
export class CouponsModule {}
