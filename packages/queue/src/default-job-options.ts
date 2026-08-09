import type { JobsOptions } from "bullmq";

// Retry policy every queue gets unless a job overrides it. Bounded counts
// (not `true`/`false`) — unbounded `removeOnComplete: false` grows Redis
// memory forever, unbounded `true` deletes the failure history needed to
// debug a bad job.
export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
};
