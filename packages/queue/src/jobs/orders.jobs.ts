// apps/workers owns *scheduling* only — the job carries no payload, it's
// just a tick that tells apps/workers to call apps/api's internal
// expire-sweep endpoint (see the migration plan's order-expiration section).
export const EXPIRE_ORDERS_JOB_NAME = "expire-sweep";

// BullMQ job-scheduler id (Queue#upsertJobScheduler) — shared so re-running
// the scheduler registration on every apps/workers boot updates the same
// repeatable job instead of creating a duplicate.
export const EXPIRE_ORDERS_SCHEDULER_ID = "expire-orders";

// Every 5 minutes, preserving the cadence of the removed in-process scheduler.
export const EXPIRE_ORDERS_CRON_PATTERN = "*/5 * * * *";

export const ASSISTED_IDENTITY_RETENTION_JOB_NAME =
  "assisted-identity-retention-sweep";
export const ASSISTED_IDENTITY_RETENTION_SCHEDULER_ID =
  "assisted-identity-retention";
// Runs daily; the API operation itself checks each order's closedAt timestamp.
export const ASSISTED_IDENTITY_RETENTION_CRON_PATTERN = "17 3 * * *";

// Shared by apps/workers' outbound call and apps/api's InternalJobsSecretGuard
// so the header name can't drift between producer and consumer.
export const INTERNAL_JOBS_SECRET_HEADER = "x-internal-jobs-secret";
