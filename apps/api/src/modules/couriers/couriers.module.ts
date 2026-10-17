import { Module } from "@nestjs/common";
import {
  CouriersController,
  PublicCouriersController,
} from "./couriers.controller.js";
import { CouriersService } from "./couriers.service.js";

@Module({
  controllers: [CouriersController, PublicCouriersController],
  providers: [CouriersService],
  exports: [CouriersService],
})
export class CouriersModule {}
