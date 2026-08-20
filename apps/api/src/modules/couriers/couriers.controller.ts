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
import { ApiTags } from "@nestjs/swagger";
import { CouriersService } from "./couriers.service.js";
import { CreateCourierDto } from "./dto/create-courier.dto.js";
import { UpdateCourierDto } from "./dto/update-courier.dto.js";
import type {
  CourierResponseDto,
  CourierModalityResponseDto,
} from "./dto/courier-response.dto.js";
import type { PublicCourierDto } from "./dto/public-courier-response.dto.js";

interface CourierModalityRow {
  id: string;
  modality: "AGENCY" | "HOME";
  price: { toString(): string };
  enabled: boolean;
}

interface CourierRow {
  id: string;
  storeId: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
  configs: CourierModalityRow[];
}

function toCourierModalityDto(
  row: CourierModalityRow,
): CourierModalityResponseDto {
  return {
    id: row.id,
    modality: row.modality,
    price: row.price.toString(),
    enabled: row.enabled,
  };
}

function toCourierDto(row: CourierRow): CourierResponseDto {
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    modalities: row.configs.map(toCourierModalityDto),
  };
}

function toPublicCourierDto(row: CourierRow): PublicCourierDto {
  return {
    id: row.id,
    name: row.name,
    modalities: row.configs.map((c) => ({
      modality: c.modality,
      price: c.price.toString(),
    })),
  };
}

@ApiTags("Couriers")
@Controller("stores/:storeId/couriers")
@UseGuards(AuthGuard)
export class CouriersController {
  constructor(private couriers: CouriersService) {}

  @Get()
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<CourierResponseDto[]> {
    const rows = await this.couriers.findAllForStore(
      storeId,
      session.user.id,
    );
    return rows.map(toCourierDto);
  }

  @Post()
  async create(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreateCourierDto,
  ): Promise<CourierResponseDto> {
    const row = await this.couriers.create(storeId, session.user.id, dto);
    return toCourierDto(row);
  }

  @Patch(":courierId")
  async update(
    @Param("storeId") storeId: string,
    @Param("courierId") courierId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateCourierDto,
  ): Promise<CourierResponseDto> {
    const row = await this.couriers.update(
      courierId,
      storeId,
      session.user.id,
      dto,
    );
    return toCourierDto(row);
  }

  @Delete(":courierId")
  async remove(
    @Param("storeId") storeId: string,
    @Param("courierId") courierId: string,
    @Session() session: UserSession,
  ): Promise<CourierResponseDto> {
    const row = await this.couriers.remove(
      courierId,
      storeId,
      session.user.id,
    );
    return toCourierDto(row);
  }
}

@ApiTags("PublicCouriers")
@Controller("stores/:slug/public/couriers")
export class PublicCouriersController {
  constructor(private couriers: CouriersService) {}

  @Public()
  @Get()
  async findEnabled(
    @Param("slug") slug: string,
  ): Promise<PublicCourierDto[]> {
    const rows = await this.couriers.findEnabledForSlug(slug);
    return rows.map(toPublicCourierDto);
  }
}
