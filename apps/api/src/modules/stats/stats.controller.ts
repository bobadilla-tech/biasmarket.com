import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiQuery } from "@nestjs/swagger";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { StatsService } from "./stats.service.js";
import type { AnalyticsRange } from "./analytics.types.js";
import {
  AnalyticsResultResponseDto,
  PaymentMethodsBreakdownResponseDto,
  StatsOverviewResponseDto,
} from "./dto/stats-response.dto.js";
import { toOrderDto } from "../orders/infrastructure/order.controller.js";

const ANALYTICS_RANGES: AnalyticsRange[] = ["30d", "90d", "12m"];

@Controller("stores/:storeId/stats")
@UseGuards(AuthGuard)
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get("overview")
  async overview(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<StatsOverviewResponseDto> {
    const result = await this.stats.getOverview(storeId, session.user.id);
    return {
      ...result,
      recentOrders: result.recentOrders.map(toOrderDto),
    };
  }

  @ApiQuery({ name: "range", required: false, type: String })
  @Get("analytics")
  analytics(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Query("range") range: string | undefined,
  ): Promise<AnalyticsResultResponseDto> {
    const resolvedRange = (range ?? "30d") as AnalyticsRange;
    if (!ANALYTICS_RANGES.includes(resolvedRange)) {
      throw new BadRequestException("Rango inválido");
    }
    return this.stats.getAnalytics(storeId, session.user.id, resolvedRange);
  }

  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @Get("payment-methods")
  paymentMethods(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
  ): Promise<PaymentMethodsBreakdownResponseDto> {
    const now = new Date();
    const resolvedFrom = from
      ? new Date(from)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const resolvedTo = to ? new Date(to) : now;
    if (
      Number.isNaN(resolvedFrom.getTime()) ||
      Number.isNaN(resolvedTo.getTime())
    ) {
      throw new BadRequestException("Fechas inválidas");
    }
    if (resolvedFrom >= resolvedTo) {
      throw new BadRequestException("Rango inválido");
    }
    return this.stats.getPaymentMethodsBreakdown(
      storeId,
      session.user.id,
      resolvedFrom,
      resolvedTo,
    );
  }
}
