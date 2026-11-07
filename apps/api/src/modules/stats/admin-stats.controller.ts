import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthGuard, Roles } from "@thallesp/nestjs-better-auth";
import { StatsService } from "./stats.service.js";
import {
  AdminAssistedOrderMetricsQueryDto,
  AdminAssistedOrderMetricsResponseDto,
} from "./dto/admin-assisted-order-metrics.dto.js";

/**
 * Administrative statistics controller exposing aggregated pilot metrics.
 */
@ApiTags("Stats")
@Controller("admin/stats")
@UseGuards(AuthGuard)
@Roles(["admin"])
export class AdminStatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * Returns aggregated assisted-order pilot metrics with zero PII exposure.
   */
  @Get("assisted-orders")
  getAssistedOrderMetrics(
    @Query() query: AdminAssistedOrderMetricsQueryDto,
  ): Promise<AdminAssistedOrderMetricsResponseDto> {
    return this.statsService.getAdminAssistedOrderMetrics(query);
  }
}
