import { Processor } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { INTERNAL_JOBS_SECRET_HEADER, QUEUE_NAMES } from "@biasmarket/queue";
import { requiredEnv } from "../../config/env.validation.js";
import { ObservedProcessor } from "../../common/observed-processor.js";

@Processor(QUEUE_NAMES.PAYMENT_PROOF_SWEEP)
export class PaymentProofSweepProcessor extends ObservedProcessor {
  private readonly logger = new Logger(PaymentProofSweepProcessor.name);

  async process(job: Job): Promise<{ deleted: number; failed: number }> {
    const internalApiUrl = requiredEnv("INTERNAL_API_URL");
    const secret = requiredEnv("INTERNAL_JOBS_SECRET");
    const response = await fetch(
      `${internalApiUrl}/internal/orders/orphan-payment-proof-sweep`,
      {
        method: "POST",
        headers: { [INTERNAL_JOBS_SECRET_HEADER]: secret },
      },
    );
    if (!response.ok) {
      throw new Error(
        `orphan-proof-sweep request failed: ${response.status} ${response.statusText}`,
      );
    }
    const result = (await response.json()) as {
      deleted: number;
      failed: number;
    };
    this.logger.log(
      `Orphan proof sweep job ${job.id} deleted ${result.deleted} object(s); ${result.failed} failed`,
    );
    return result;
  }
}
