import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, Public, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { ApiQuery } from "@nestjs/swagger";
import { PaymentConfigService } from "./payment-config.service.js";
import { UpsertPaymentMethodDto } from "./dto/upsert-payment-method.dto.js";
import { PaymentMethodConfigResponseDto } from "./dto/payment-method-response.dto.js";

interface PaymentMethodConfigRow {
  id: string;
  storeId: string;
  method: "YAPE" | "PLIN" | "TRANSFER" | "CASH";
  enabled: boolean;
  details: unknown;
  depositPercentPickup: number;
  depositPercentCourier: number;
  createdAt: Date;
}

function toPaymentMethodDto(
  row: PaymentMethodConfigRow,
): PaymentMethodConfigResponseDto {
  return {
    ...row,
    details: row.details as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

@Controller("stores/:storeId/payment-methods")
@UseGuards(AuthGuard)
export class PaymentConfigController {
  constructor(private paymentConfig: PaymentConfigService) {}

  @ApiQuery({ name: "enabled", required: false, type: String })
  @Get()
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Query("enabled") enabled?: string,
  ): Promise<PaymentMethodConfigResponseDto[]> {
    const rows = enabled === "1" || enabled === "true"
      ? await this.paymentConfig.findEnabledForStore(storeId, session.user.id)
      : await this.paymentConfig.findAllForStore(storeId, session.user.id);
    return rows.map(toPaymentMethodDto);
  }

  @Post()
  async upsert(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Body() dto: UpsertPaymentMethodDto,
  ): Promise<PaymentMethodConfigResponseDto> {
    const row = await this.paymentConfig.upsert(storeId, session.user.id, dto);
    return toPaymentMethodDto(row);
  }
}

@Controller("stores/:slug/public/payment-methods")
export class PublicPaymentConfigController {
  constructor(private paymentConfig: PaymentConfigService) {}

  @Public()
  @Get()
  async findEnabled(
    @Param("slug") slug: string,
  ): Promise<PaymentMethodConfigResponseDto[]> {
    const rows = await this.paymentConfig.findEnabledForSlug(slug);
    return rows.map(toPaymentMethodDto);
  }
}
