import { type Mock, vi } from "vitest";
import type { Queue } from "bullmq";
import {
  EXPIRE_ORDERS_CRON_PATTERN,
  EXPIRE_ORDERS_JOB_NAME,
  EXPIRE_ORDERS_SCHEDULER_ID,
} from "@biasmarket/queue";
import { ExpireOrdersSchedulerService } from "./expire-orders-scheduler.service.js";

describe("ExpireOrdersSchedulerService", () => {
  it("registers a single repeatable job scheduler on module init", async () => {
    const queue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue & { upsertJobScheduler: Mock };
    const service = new ExpireOrdersSchedulerService(queue);

    await service.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      EXPIRE_ORDERS_SCHEDULER_ID,
      { pattern: EXPIRE_ORDERS_CRON_PATTERN },
      { name: EXPIRE_ORDERS_JOB_NAME },
    );
  });
});
