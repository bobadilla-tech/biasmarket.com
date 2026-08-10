import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  EXPIRE_ORDERS_CRON_PATTERN,
  EXPIRE_ORDERS_JOB_NAME,
  EXPIRE_ORDERS_SCHEDULER_ID,
  QUEUE_NAMES,
} from "@biasmarket/queue";

// apps/workers owns scheduling: a single BullMQ job scheduler dispatches
// this job on a cron tick, regardless of how many apps/api replicas exist —
// see the migration plan's "Decision: order-expiration sweep" section for
// why this replaced apps/api's own in-process @Cron. upsertJobScheduler is
// idempotent by schedulerId, so re-running this on every boot updates the
// same repeatable job instead of creating a duplicate.
@Injectable()
export class ExpireOrdersSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ExpireOrdersSchedulerService.name);

  constructor(@InjectQueue(QUEUE_NAMES.ORDERS) private queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      EXPIRE_ORDERS_SCHEDULER_ID,
      { pattern: EXPIRE_ORDERS_CRON_PATTERN },
      { name: EXPIRE_ORDERS_JOB_NAME },
    );
    this.logger.log(
      `Registered "${EXPIRE_ORDERS_SCHEDULER_ID}" job scheduler (${EXPIRE_ORDERS_CRON_PATTERN})`,
    );
  }
}
