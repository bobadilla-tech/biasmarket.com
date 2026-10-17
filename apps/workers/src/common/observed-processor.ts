import { OnWorkerEvent, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { captureJobError } from "./error-tracking.js";

// Base class for every processor. Before this, a job that threw was recorded
// in Redis by BullMQ and nothing else: no log line, no error report. Handlers
// declared here are found on subclasses too (the explorer scans the prototype
// chain), so each processor gets them by extending this instead of WorkerHost.
export abstract class ObservedProcessor extends WorkerHost {
  private readonly observerLogger = new Logger(this.constructor.name);

  // Every failed attempt is logged. Only the last one is reported as an error,
  // so a job that succeeds on its third try does not page anyone.
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error): void {
    const attempts = job?.opts.attempts ?? 1;
    const attemptsMade = job?.attemptsMade ?? attempts;
    const finalAttempt = attemptsMade >= attempts;
    const details = {
      queue: job?.queueName,
      job: job?.name,
      jobId: job?.id,
      attemptsMade,
      attempts,
    };

    if (!finalAttempt) {
      this.observerLogger.warn({
        msg: `Job failed, will retry: ${error.message}`,
        ...details,
      });
      return;
    }

    // The error goes in `err` (pino serializes its type, message and stack).
    // A second string argument would be merged into `msg` and duplicate it.
    this.observerLogger.error({
      msg: `Job failed for good: ${error.message}`,
      err: error,
      ...details,
    });
    captureJobError(error, {
      queue: job?.queueName ?? "unknown",
      job: job?.name ?? "unknown",
      jobId: job?.id,
    });
  }

  // A worker-level error is not tied to a job: lost Redis connection, a
  // stalled lock. Without a listener BullMQ would only print it to the console.
  @OnWorkerEvent("error")
  onWorkerError(error: Error): void {
    this.observerLogger.error({
      msg: `Worker error: ${error.message}`,
      err: error,
    });
  }
}
