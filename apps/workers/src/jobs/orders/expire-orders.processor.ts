import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  ASSISTED_IDENTITY_RETENTION_JOB_NAME,
  EXPIRE_ORDERS_JOB_NAME,
  INTERNAL_JOBS_SECRET_HEADER,
  QUEUE_NAMES,
} from "@biasmarket/queue";
import { requiredEnv } from "../../config/env.validation.js";

// apps/workers owns *scheduling* only — this processor does nothing more
// than call apps/api's internal endpoint, which still runs
// ExpireOrdersUseCase in-process with full access to the orders domain
// layer. Never over the public api.biasmarket.com domain — INTERNAL_API_URL
// is the internal Docker network hostname (same convention apps/web already
// uses for its own SSR fetches).
@Processor(QUEUE_NAMES.ORDERS)
export class ExpireOrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpireOrdersProcessor.name);

  async process(
    job: Job,
  ): Promise<{ cancelled: number } | { anonymized: number }> {
    const internalApiUrl = requiredEnv("INTERNAL_API_URL");
    const secret = requiredEnv("INTERNAL_JOBS_SECRET");
    const endpoint =
      job.name === ASSISTED_IDENTITY_RETENTION_JOB_NAME
        ? "assisted-identity-retention-sweep"
        : job.name === EXPIRE_ORDERS_JOB_NAME
          ? "expire-sweep"
          : null;
    if (!endpoint) {
      throw new Error(`Unsupported orders job: ${job.name}`);
    }

    const response = await fetch(
      `${internalApiUrl}/internal/orders/${endpoint}`,
      {
        method: "POST",
        headers: { [INTERNAL_JOBS_SECRET_HEADER]: secret },
      },
    );

    if (!response.ok) {
      throw new Error(
        `expire-sweep request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as
      { cancelled: number } | { anonymized: number };
    if ("cancelled" in result) {
      this.logger.log(
        `Expire-sweep job ${job.id} cancelled ${result.cancelled} order(s)`,
      );
    } else {
      this.logger.log(
        `Assisted identity-retention job ${job.id} anonymized ${result.anonymized} order(s)`,
      );
    }
    return result;
  }
}
