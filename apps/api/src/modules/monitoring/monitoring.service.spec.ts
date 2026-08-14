import { Test, type TestingModule } from '@nestjs/testing';
import { type Mock, vi } from 'vitest';
import { MonitoringService } from './monitoring.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { KumaWebhookDto } from './dto/kuma-webhook.dto.js';

function heartbeat(overrides: Partial<KumaWebhookDto['heartbeat']> = {}) {
  return {
    monitorID: 1,
    status: 0,
    important: true,
    ...overrides,
  };
}

describe('MonitoringService', () => {
  let service: MonitoringService;
  let prisma: {
    platformIncident: {
      findFirst: Mock;
      create: Mock;
      update: Mock;
      findMany: Mock;
      count: Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      platformIncident: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MonitoringService>(MonitoringService);
  });

  it('recordEvent() opens a new incident on a DOWN transition when none is open', async () => {
    prisma.platformIncident.findFirst.mockResolvedValue(null);
    prisma.platformIncident.create.mockResolvedValue({ id: 'incident-1' });

    const dto: KumaWebhookDto = {
      heartbeat: heartbeat({ status: 0, msg: 'connection refused' }),
      monitor: { name: 'API (external)' },
    };

    await service.recordEvent(dto);

    expect(prisma.platformIncident.create).toHaveBeenCalledWith({
      data: {
        monitorId: 1,
        monitorName: 'API (external)',
        message: 'connection refused',
      },
    });
  });

  it('recordEvent() does not open a duplicate incident on a second DOWN transition', async () => {
    prisma.platformIncident.findFirst.mockResolvedValue({ id: 'incident-1' });

    const dto: KumaWebhookDto = {
      heartbeat: heartbeat({ status: 0 }),
      monitor: { name: 'API (external)' },
    };

    await service.recordEvent(dto);

    expect(prisma.platformIncident.create).not.toHaveBeenCalled();
  });

  it('recordEvent() closes the open incident on an UP transition', async () => {
    prisma.platformIncident.findFirst.mockResolvedValue({ id: 'incident-1' });
    prisma.platformIncident.update.mockResolvedValue({});

    const dto: KumaWebhookDto = {
      heartbeat: heartbeat({ status: 1 }),
      monitor: { name: 'API (external)' },
    };

    await service.recordEvent(dto);

    expect(prisma.platformIncident.update).toHaveBeenCalledWith({
      where: { id: 'incident-1' },
      data: { resolvedAt: expect.any(Date) },
    });
  });

  it('recordEvent() is a no-op on an UP transition with nothing open', async () => {
    prisma.platformIncident.findFirst.mockResolvedValue(null);

    const dto: KumaWebhookDto = {
      heartbeat: heartbeat({ status: 1 }),
      monitor: { name: 'API (external)' },
    };

    await service.recordEvent(dto);

    expect(prisma.platformIncident.update).not.toHaveBeenCalled();
  });

  it('findAll() lists incidents newest first with pagination', async () => {
    prisma.platformIncident.findMany.mockResolvedValue([]);
    prisma.platformIncident.count.mockResolvedValue(0);

    await service.findAll(2, 10);

    expect(prisma.platformIncident.findMany).toHaveBeenCalledWith({
      orderBy: { startedAt: 'desc' },
      skip: 10,
      take: 10,
    });
  });
});
