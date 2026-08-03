import { Module } from "@nestjs/common";
import {
  PickupPointsController,
  PublicPickupPointsController,
} from "./pickup-points.controller.js";
import { PickupPointsService } from "./pickup-points.service.js";

@Module({
  controllers: [PickupPointsController, PublicPickupPointsController],
  providers: [PickupPointsService],
  exports: [PickupPointsService],
})
export class PickupPointsModule {}
