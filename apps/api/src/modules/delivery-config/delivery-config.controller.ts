import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, Public, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { DeliveryConfigService } from "./delivery-config.service.js";
import { UpsertDeliveryMethodDto } from "./dto/upsert-delivery-method.dto.js";
import type { DeliveryMethodConfigResponseDto } from "./dto/delivery-method-response.dto.js";

interface DeliveryMethodConfigRow {
  id: string;
  storeId: string;
  type: "PICKUP" | "COURIER";
  enabled: boolean;
  details: unknown;
  createdAt: Date;
}

function toDeliveryMethodDto(
  row: DeliveryMethodConfigRow,
): DeliveryMethodConfigResponseDto {
  return {
    ...row,
    details: row.details as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

@Controller("stores/:storeId/delivery-methods")
@UseGuards(AuthGuard)
export class DeliveryConfigController {
  constructor(private deliveryConfig: DeliveryConfigService) {}

  @Get()
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<DeliveryMethodConfigResponseDto[]> {
    const rows = await this.deliveryConfig.findAllForStore(
      storeId,
      session.user.id,
    );
    return rows.map(toDeliveryMethodDto);
  }

  @Post()
  async upsert(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Body() dto: UpsertDeliveryMethodDto,
  ): Promise<DeliveryMethodConfigResponseDto> {
    const row = await this.deliveryConfig.upsert(
      storeId,
      session.user.id,
      dto,
    );
    return toDeliveryMethodDto(row);
  }

  @Delete(":type")
  async remove(
    @Param("storeId") storeId: string,
    @Param("type") type: "PICKUP" | "COURIER",
    @Session() session: UserSession,
  ): Promise<DeliveryMethodConfigResponseDto> {
    const row = await this.deliveryConfig.remove(
      storeId,
      session.user.id,
      type,
    );
    return toDeliveryMethodDto(row);
  }
}

@Controller("stores/:slug/public/delivery-methods")
export class PublicDeliveryConfigController {
  constructor(private deliveryConfig: DeliveryConfigService) {}

  @Public()
  @Get()
  async findEnabled(
    @Param("slug") slug: string,
  ): Promise<DeliveryMethodConfigResponseDto[]> {
    const rows = await this.deliveryConfig.findEnabledForSlug(slug);
    return rows.map(toDeliveryMethodDto);
  }
}
