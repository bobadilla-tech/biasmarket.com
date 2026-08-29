import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  EXPIRE_PREMIUM_CRON_PATTERN,
  EXPIRE_PREMIUM_JOB_NAME,
  EXPIRE_PREMIUM_SCHEDULER_ID,
  QUEUE_NAMES,
} from "@biasmarket/queue";

// Mirrors jobs/orders/expire-orders-scheduler.service.ts. upsertJobScheduler
// is idempotent by schedulerId, so re-running this on every boot updates the
// same repeatable job instead of creating a duplicate.
@Injectable()
export class ExpirePremiumSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ExpirePremiumSchedulerService.name);

  constructor(@InjectQueue(QUEUE_NAMES.PREMIUM) private queue: Queue) {}

  async onModuleInit(): Promise<void> {
    if (process.env.E2E_DISABLE_EXPIRATION_SCHEDULERS === "true") {
      this.logger.log(
        "premium expiration scheduler disabled (E2E_DISABLE_EXPIRATION_SCHEDULERS)",
      );
      return;
    }

    await this.queue.upsertJobScheduler(
      EXPIRE_PREMIUM_SCHEDULER_ID,
      { pattern: EXPIRE_PREMIUM_CRON_PATTERN },
      { name: EXPIRE_PREMIUM_JOB_NAME },
    );
    this.logger.log(
      `Registered "${EXPIRE_PREMIUM_SCHEDULER_ID}" job scheduler (${EXPIRE_PREMIUM_CRON_PATTERN})`,
    );
  }
}
