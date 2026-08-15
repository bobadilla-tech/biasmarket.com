import { type Mock, vi } from "vitest";
import type { Queue } from "bullmq";
import {
  EXPIRE_PREMIUM_CRON_PATTERN,
  EXPIRE_PREMIUM_JOB_NAME,
  EXPIRE_PREMIUM_SCHEDULER_ID,
} from "@biasmarket/queue";
import { ExpirePremiumSchedulerService } from "./expire-premium-scheduler.service.js";

describe("ExpirePremiumSchedulerService", () => {
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
});
