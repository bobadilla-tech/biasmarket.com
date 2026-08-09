// Real queue names (mailer, orders, etc.) land with the companion migration
// plan (2026-08-09-migrate-background-jobs-to-workers-plan.md) once actual
// job characteristics are known. This plan only needs one entry to prove the
// producer (apps/api) / consumer (apps/workers) shape works end to end.
export const QUEUE_NAMES = {
  PING: "ping",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
