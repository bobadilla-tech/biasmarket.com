import { z } from "zod";

// Placeholder proof-of-pipeline job — the only job this plan ships. Real job
// contracts (mailer, orders) land with the companion migration plan.
export const PING_JOB_NAME = "ping";

// Payload crosses a process boundary through Redis (serialized to JSON), so
// it can drift from its compile-time type in a way an in-process function
// call cannot — validate on both ends: apps/api before queue.add(),
// apps/workers on job pickup.
export const pingJobPayloadSchema = z.object({
  message: z.string().min(1),
});

export type PingJobPayload = z.infer<typeof pingJobPayloadSchema>;
