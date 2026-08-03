import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, Public, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { PickupPointsService } from "./pickup-points.service.js";
import { CreatePickupPointDto } from "./dto/create-pickup-point.dto.js";
import { UpdatePickupPointDto } from "./dto/update-pickup-point.dto.js";

@Controller("stores/:storeId/pickup-points")
@UseGuards(AuthGuard)
export class PickupPointsController {
  constructor(private pickupPoints: PickupPointsService) {}

  @Get()
  findAll(@Param("storeId") storeId: string, @Session() session: UserSession) {
    return this.pickupPoints.findAllForStore(storeId, session.user.id);
  }

  @Post()
  create(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreatePickupPointDto,
  ) {
    return this.pickupPoints.create(storeId, session.user.id, dto);
  }

  @Patch(":pointId")
  update(
    @Param("storeId") storeId: string,
    @Param("pointId") pointId: string,
    @Session() session: UserSession,
    @Body() dto: UpdatePickupPointDto,
  ) {
    return this.pickupPoints.update(pointId, storeId, session.user.id, dto);
  }

  @Delete(":pointId")
  remove(
    @Param("storeId") storeId: string,
    @Param("pointId") pointId: string,
    @Session() session: UserSession,
  ) {
    return this.pickupPoints.remove(pointId, storeId, session.user.id);
  }
}

@Controller("stores/:slug/public/pickup-points")
export class PublicPickupPointsController {
  constructor(private pickupPoints: PickupPointsService) {}

  @Public()
  @Get()
  findEnabled(@Param("slug") slug: string) {
    return this.pickupPoints.findEnabledForSlug(slug);
  }
}
