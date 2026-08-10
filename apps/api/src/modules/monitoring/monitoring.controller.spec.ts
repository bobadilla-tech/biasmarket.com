import { Test, type TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { MonitoringController } from "./monitoring.controller.js";
import { MonitoringService } from "./monitoring.service.js";
import type { KumaWebhookDto } from "./dto/kuma-webhook.dto.js";

vi.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class AuthGuard {},
  Public: () => () => undefined,
  Roles: () => () => undefined,
}));

vi.mock("@nestjs/throttler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nestjs/throttler")>();
  return { ...actual, ThrottlerGuard: class ThrottlerGuard {} };
});

const incidentRow = {
  id: "incident-1",
  monitorId: 1,
  monitorName: "API (external)",
  message: "connection refused",
  startedAt: new Date("2026-01-01T00:00:00.000Z"),
  resolvedAt: null,
};

describe("MonitoringController", () => {
  let controller: MonitoringController;
  let service: { recordEvent: Mock; findAll: Mock };

  beforeEach(async () => {
    service = {
      recordEvent: vi.fn().mockResolvedValue(incidentRow),
      findAll: vi
        .fn()
        .mockResolvedValue({
          incidents: [incidentRow],
          total: 1,
          page: 1,
          limit: 24,
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonitoringController],
      providers: [{ provide: MonitoringService, useValue: service }],
    }).compile();

    controller = module.get<MonitoringController>(MonitoringController);
  });

  it("webhook() delegates to service.recordEvent when the heartbeat is important", async () => {
    const dto: KumaWebhookDto = {
      heartbeat: { monitorID: 1, status: 0, important: true },
      monitor: { name: "API (external)" },
    };

    const result = await controller.webhook(dto);

    expect(service.recordEvent).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ status: "ok" });
  });

  it("webhook() skips service.recordEvent for a routine, non-important ping", async () => {
    const dto: KumaWebhookDto = {
      heartbeat: { monitorID: 1, status: 1, important: false },
      monitor: { name: "API (external)" },
    };

    const result = await controller.webhook(dto);

    expect(service.recordEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "ok" });
  });

  it("findAll() delegates to service.findAll with parsed pagination and maps dates to ISO strings", async () => {
    const result = await controller.findAll("2", "10");

    expect(service.findAll).toHaveBeenCalledWith(2, 10);
    expect(result.incidents[0].startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.incidents[0].resolvedAt).toBeNull();
  });
});
