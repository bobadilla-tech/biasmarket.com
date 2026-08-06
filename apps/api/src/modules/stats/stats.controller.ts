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
}
