import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { INTERNAL_JOBS_SECRET_HEADER, QUEUE_NAMES } from "@biasmarket/queue";
import { requiredEnv } from "../../config/env.validation.js";

// Mirrors jobs/orders/expire-orders.processor.ts: apps/workers owns
// *scheduling* only — this processor does nothing more than call apps/api's
// internal endpoint, which still runs ExpirePremiumUseCase in-process.
@Processor(QUEUE_NAMES.PREMIUM)
export class ExpirePremiumProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpirePremiumProcessor.name);

  async process(job: Job): Promise<{ expired: number }> {
    const internalApiUrl = requiredEnv("INTERNAL_API_URL");
    const secret = requiredEnv("INTERNAL_JOBS_SECRET");

    const response = await fetch(
      `${internalApiUrl}/internal/premium/expire-sweep`,
      {
        method: "POST",
        headers: { [INTERNAL_JOBS_SECRET_HEADER]: secret },
      },
    );

    if (!response.ok) {
      throw new Error(
        `expire-premium-sweep request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as { expired: number };
    this.logger.log(
      `Expire-premium-sweep job ${job.id} reset ${result.expired} user(s)`,
    );
    return result;
  }
}
