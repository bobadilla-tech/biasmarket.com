import { type Mock, vi } from "vitest";
import type { Queue } from "bullmq";
import {
  EXPIRE_PREMIUM_CRON_PATTERN,
  EXPIRE_PREMIUM_JOB_NAME,
  EXPIRE_PREMIUM_SCHEDULER_ID,
} from "@biasmarket/queue";
import { ExpirePremiumSchedulerService } from "./expire-premium-scheduler.service.js";

describe("ExpirePremiumSchedulerService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers a single repeatable job scheduler on module init", async () => {
    const queue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue & { upsertJobScheduler: Mock };
    const service = new ExpirePremiumSchedulerService(queue);

    await service.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      EXPIRE_PREMIUM_SCHEDULER_ID,
      { pattern: EXPIRE_PREMIUM_CRON_PATTERN },
      { name: EXPIRE_PREMIUM_JOB_NAME },
    );
  });

  it("does not register the scheduler when disabled for E2E", async () => {
    vi.stubEnv("E2E_DISABLE_EXPIRATION_SCHEDULERS", "true");
    const queue = {
      upsertJobScheduler: vi.fn(),
    } as unknown as Queue & { upsertJobScheduler: Mock };
    const service = new ExpirePremiumSchedulerService(queue);
    const logger = (service as unknown as { logger: { log: Mock } }).logger;
    const log = vi.spyOn(logger, "log");

    await service.onModuleInit();

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "premium expiration scheduler disabled (E2E_DISABLE_EXPIRATION_SCHEDULERS)",
    );
  });
});
