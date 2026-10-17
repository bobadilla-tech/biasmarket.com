import { type Mock, vi } from "vitest";
import type { Queue } from "bullmq";
import {
  ASSISTED_IDENTITY_RETENTION_CRON_PATTERN,
  ASSISTED_IDENTITY_RETENTION_JOB_NAME,
  ASSISTED_IDENTITY_RETENTION_SCHEDULER_ID,
  EXPIRE_ORDERS_CRON_PATTERN,
  EXPIRE_ORDERS_JOB_NAME,
  EXPIRE_ORDERS_SCHEDULER_ID,
} from "@biasmarket/queue";
import { ExpireOrdersSchedulerService } from "./expire-orders-scheduler.service.js";

describe("ExpireOrdersSchedulerService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers repeatable expiry and retention schedulers on module init", async () => {
    const queue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue & { upsertJobScheduler: Mock };
    const service = new ExpireOrdersSchedulerService(queue);

    await service.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      EXPIRE_ORDERS_SCHEDULER_ID,
      { pattern: EXPIRE_ORDERS_CRON_PATTERN },
      { name: EXPIRE_ORDERS_JOB_NAME },
    );
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      ASSISTED_IDENTITY_RETENTION_SCHEDULER_ID,
      { pattern: ASSISTED_IDENTITY_RETENTION_CRON_PATTERN },
      { name: ASSISTED_IDENTITY_RETENTION_JOB_NAME },
    );
  });

  it("does not register the scheduler when disabled for E2E", async () => {
    vi.stubEnv("E2E_DISABLE_EXPIRATION_SCHEDULERS", "true");
    const queue = {
      upsertJobScheduler: vi.fn(),
    } as unknown as Queue & { upsertJobScheduler: Mock };
    const service = new ExpireOrdersSchedulerService(queue);
    const logger = (service as unknown as { logger: { log: Mock } }).logger;
    const log = vi.spyOn(logger, "log");

    await service.onModuleInit();

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "orders expiration scheduler disabled (E2E_DISABLE_EXPIRATION_SCHEDULERS)",
    );
  });
});
