import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  type PingJobPayload,
  pingJobPayloadSchema,
  QUEUE_NAMES,
} from "@biasmarket/queue";

// The one proof-of-pipeline job this plan ships — confirms a job enqueued by
// apps/api is picked up and completed by apps/workers, with retry/backoff
// and graceful shutdown wired the same way apps/api's own infra is. Real
// jobs (mailer, order-expiration sweep) land with the companion migration
// plan.
@Processor(QUEUE_NAMES.PING)
export class PingProcessor extends WorkerHost {
  private readonly logger = new Logger(PingProcessor.name);

  async process(
    job: Job<PingJobPayload>,
  ): Promise<{ pong: true; receivedAt: string }> {
    // Validated here too, not just at apps/api's enqueue call — a payload
    // crosses a process boundary through Redis (serialized to JSON), so it
    // can drift from its compile-time type in a way an in-process call
    // cannot (a stale worker deployed against a newer payload shape, a
    // hand-crafted queue.add() that skipped the type checker).
    const payload = pingJobPayloadSchema.parse(job.data);
    this.logger.log(`Processed ping job ${job.id}: "${payload.message}"`);
    return { pong: true, receivedAt: new Date().toISOString() };
  }
}
