import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard, Public, Roles } from "@thallesp/nestjs-better-auth";
import { ApiQuery } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { MonitoringService } from "./monitoring.service.js";
import { MonitoringWebhookSecretGuard } from "./monitoring-webhook-secret.guard.js";
import { KumaWebhookDto } from "./dto/kuma-webhook.dto.js";
import type {
  IncidentListResponseDto,
  IncidentResponseDto,
} from "./dto/incident-response.dto.js";
import { parsePublicListQuery } from "../../common/public-list-query.js";

interface PlatformIncidentRow {
  id: string;
  monitorId: number;
  monitorName: string;
  message: string;
  startedAt: Date;
  resolvedAt: Date | null;
}

function toIncidentDto(incident: PlatformIncidentRow): IncidentResponseDto {
  return {
    ...incident,
    startedAt: incident.startedAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
  };
}

@Controller("monitoring")
export class MonitoringController {
  constructor(private monitoring: MonitoringService) {}

  @Public()
  @UseGuards(MonitoringWebhookSecretGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post("webhook")
  async webhook(@Body() dto: KumaWebhookDto): Promise<{ status: "ok" }> {
    if (dto.heartbeat.important) {
      await this.monitoring.recordEvent(dto);
    }
    return { status: "ok" };
  }

  @UseGuards(AuthGuard)
  @Roles(["admin"])
  @ApiQuery({ name: "page", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: String })
  @Get("incidents")
  async findAll(
    @Query("page") page: string | undefined,
    @Query("limit") limit: string | undefined,
  ): Promise<IncidentListResponseDto> {
    const parsed = parsePublicListQuery(limit, page, undefined);
    const result = await this.monitoring.findAll(parsed.page, parsed.limit);
    return { ...result, incidents: result.incidents.map(toIncidentDto) };
  }
}
