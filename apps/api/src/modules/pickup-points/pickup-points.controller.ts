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
import type { PickupPointResponseDto } from "./dto/pickup-point-response.dto.js";

interface PickupPointRow {
  id: string;
  storeId: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
}

function toPickupPointDto(row: PickupPointRow): PickupPointResponseDto {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

@Controller("stores/:storeId/pickup-points")
@UseGuards(AuthGuard)
export class PickupPointsController {
  constructor(private pickupPoints: PickupPointsService) {}

  @Get()
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<PickupPointResponseDto[]> {
    const rows = await this.pickupPoints.findAllForStore(
      storeId,
      session.user.id,
    );
    return rows.map(toPickupPointDto);
  }

  @Post()
  async create(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreatePickupPointDto,
  ): Promise<PickupPointResponseDto> {
    const row = await this.pickupPoints.create(storeId, session.user.id, dto);
    return toPickupPointDto(row);
  }

  @Patch(":pointId")
  async update(
    @Param("storeId") storeId: string,
    @Param("pointId") pointId: string,
    @Session() session: UserSession,
    @Body() dto: UpdatePickupPointDto,
  ): Promise<PickupPointResponseDto> {
    const row = await this.pickupPoints.update(
      pointId,
      storeId,
      session.user.id,
      dto,
    );
    return toPickupPointDto(row);
  }

  @Delete(":pointId")
  async remove(
    @Param("storeId") storeId: string,
    @Param("pointId") pointId: string,
    @Session() session: UserSession,
  ): Promise<PickupPointResponseDto> {
    const row = await this.pickupPoints.remove(
      pointId,
      storeId,
      session.user.id,
    );
    return toPickupPointDto(row);
  }
}

@Controller("stores/:slug/public/pickup-points")
export class PublicPickupPointsController {
  constructor(private pickupPoints: PickupPointsService) {}

  @Public()
  @Get()
  async findEnabled(
    @Param("slug") slug: string,
  ): Promise<PickupPointResponseDto[]> {
    const rows = await this.pickupPoints.findEnabledForSlug(slug);
    return rows.map(toPickupPointDto);
  }
}
