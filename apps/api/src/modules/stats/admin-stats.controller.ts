import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard, Roles } from "@thallesp/nestjs-better-auth";
import { StatsService } from "./stats.service.js";
import {
  AdminAssistedOrderMetricsQueryDto,
  AdminAssistedOrderMetricsResponseDto,
} from "./dto/admin-assisted-order-metrics.dto.js";

@Controller("admin/stats")
@UseGuards(AuthGuard)
@Roles(["admin"])
export class AdminStatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get("assisted-orders")
  getAssistedOrderMetrics(
    @Query() query: AdminAssistedOrderMetricsQueryDto,
  ): Promise<AdminAssistedOrderMetricsResponseDto> {
    return this.statsService.getAdminAssistedOrderMetrics(query);
  }
}
