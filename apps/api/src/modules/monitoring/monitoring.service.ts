import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  KUMA_STATUS_DOWN,
  type KumaWebhookDto,
} from "./dto/kuma-webhook.dto.js";

@Injectable()
export class MonitoringService {
  constructor(private prisma: PrismaService) {}

  // Only ever called for heartbeat.important === true (Kuma's own "this is a
  // state transition" flag) — the controller filters routine pings before
  // reaching here, so no Postgres row is written per check interval.
  async recordEvent(dto: KumaWebhookDto) {
    const { heartbeat, monitor } = dto;
    const monitorId = heartbeat.monitorID;

    if (heartbeat.status === KUMA_STATUS_DOWN) {
      const open = await this.prisma.platformIncident.findFirst({
        where: { monitorId, resolvedAt: null },
      });
      if (open) return open;

      return this.prisma.platformIncident.create({
        data: {
          monitorId,
          monitorName: monitor.name,
          message: heartbeat.msg ?? dto.msg ?? "",
        },
      });
    }

    // Any non-DOWN important transition (UP, or a future status Kuma adds)
    // closes whatever incident is currently open for this monitor, if any.
    const open = await this.prisma.platformIncident.findFirst({
      where: { monitorId, resolvedAt: null },
    });
    if (!open) return null;

    return this.prisma.platformIncident.update({
      where: { id: open.id },
      data: { resolvedAt: new Date() },
    });
  }

  async findAll(page: number, limit: number) {
    const [incidents, total] = await Promise.all([
      this.prisma.platformIncident.findMany({
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.platformIncident.count(),
    ]);

    return { incidents, total, page, limit };
  }
}
