import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  expoPushPayloadSchema,
  QUEUE_NAMES,
  type ExpoPushPayload,
} from "@biasmarket/queue";

@Processor(QUEUE_NAMES.PUSH, { concurrency: 5 })
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);

  @OnWorkerEvent("ready")
  onWorkerReady(): void {
    this.logger.log("PUSH worker ready");
  }

  async process(job: Job<ExpoPushPayload>): Promise<void> {
    const payload = expoPushPayloadSchema.parse(job.data);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify({ ...payload, sound: "default" }),
    });
    if (!response.ok)
      throw new Error(`Expo push returned HTTP ${response.status}`);
    const result = (await response.json()) as {
      data?: { status?: string; message?: string };
    };
    if (result.data?.status === "error")
      throw new Error(result.data.message ?? "Expo push rejected the message");
    this.logger.log(`Sent push job ${job.id}`);
  }
}
