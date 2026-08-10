import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  QUEUE_NAMES,
  type SendEmailParams,
  sendEmailParamsSchema,
} from "@biasmarket/queue";
import { MailerCore } from "./mailer.core.js";

// Concurrency start conservative — Resend has its own rate limits, and
// unlike the old inline sends there's now real backpressure (BullMQ)
// instead of an unbounded flood if a bulk operation ever enqueues many
// emails at once.
@Processor(QUEUE_NAMES.MAILER, { concurrency: 5 })
export class MailerProcessor extends WorkerHost {
  private readonly logger = new Logger(MailerProcessor.name);
  private readonly core = new MailerCore();

  async process(job: Job<SendEmailParams>): Promise<{ id: string }> {
    // Validated here too, not just at apps/api's enqueue call — see
    // ping.processor.ts's same rationale (payload crosses a process
    // boundary through Redis, can drift from its compile-time type).
    const params = sendEmailParamsSchema.parse(job.data);
    const result = await this.core.send(params);
    this.logger.log(`Sent mailer job ${job.id} ("${params.subject}")`);
    return result;
  }
}
