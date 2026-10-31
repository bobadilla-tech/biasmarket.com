import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  expoPushPayloadSchema,
  INTERNAL_JOBS_SECRET_HEADER,
  QUEUE_NAMES,
  type ExpoPushPayload,
} from "@biasmarket/queue";
import { requiredEnv } from "../../config/env.validation.js";

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
      data?:
        | { status?: string; message?: string; details?: { error?: string } }
        | { status?: string; message?: string; details?: { error?: string } }[];
    };
    const tickets = Array.isArray(result.data)
      ? result.data
      : result.data
        ? [result.data]
        : [];
    for (const ticket of tickets) {
      if (ticket.status !== "error") continue;
      if (ticket.details?.error === "DeviceNotRegistered") {
        const pruneResponse = await fetch(
          `${requiredEnv("INTERNAL_API_URL")}/internal/device-tokens/prune`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [INTERNAL_JOBS_SECRET_HEADER]: requiredEnv(
                "INTERNAL_JOBS_SECRET",
              ),
            },
            body: JSON.stringify({ expoPushToken: payload.to }),
          },
        );
        if (!pruneResponse.ok) {
          throw new Error(
            `Could not prune unregistered Expo token: ${pruneResponse.status}`,
          );
        }
        this.logger.warn(`Pruned unregistered Expo token for job ${job.id}`);
        return;
      }
      throw new Error(ticket.message ?? "Expo push rejected the message");
    }
    this.logger.log(`Sent push job ${job.id}`);
  }
}
