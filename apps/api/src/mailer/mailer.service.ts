import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  MAILER_JOB_NAME,
  QUEUE_NAMES,
  type SendEmailParams,
  sendEmailParamsSchema,
} from "@biasmarket/queue";

@Injectable()
export class MailerService {
  constructor(
    @InjectQueue(QUEUE_NAMES.MAILER) private queue: Queue,
  ) {}

  // Signature stays identical to the old direct-send version — every call
  // site (7 of them, see the migration plan) depends on `{ id: string }`
  // without needing to change. `id` is now a BullMQ job id, not a Resend
  // message id — different meaning, same shape. Validated before
  // queue.add() so a malformed payload fails the enqueue loudly instead of
  // reaching apps/workers as garbage.
  async send(params: SendEmailParams): Promise<{ id: string }> {
    const validated = sendEmailParamsSchema.parse(params);
    const job = await this.queue.add(MAILER_JOB_NAME, validated);
    // BullMQ always assigns a job id unless jobId is explicitly overridden
    // with an empty string, which no call site here does.
    return { id: job.id! };
  }
}
