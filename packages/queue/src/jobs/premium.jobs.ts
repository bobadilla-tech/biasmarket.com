// Mirrors orders.jobs.ts's expire-orders pattern: apps/workers owns
// *scheduling* only — the job carries no payload, it's just a tick that
// tells apps/workers to call apps/api's internal premium expire-sweep
// endpoint (see docs/plans/2026-08-15-premium-coupon-system-audit.md's M7).
export const EXPIRE_PREMIUM_JOB_NAME = "expire-premium-sweep";

// BullMQ job-scheduler id (Queue#upsertJobScheduler) — shared so re-running
// the scheduler registration on every apps/workers boot updates the same
// repeatable job instead of creating a duplicate.
export const EXPIRE_PREMIUM_SCHEDULER_ID = "expire-premium";

// Coarser than orders' 5-minute sweep: a stale plan="premium" string past
// premiumUntil isn't security-sensitive (every authorization check already
// re-verifies premiumUntil, never trusts plan alone — see the audit's M7
// note), so this only needs to keep the stored plan column from lying
// indefinitely, not react within minutes.
export const EXPIRE_PREMIUM_CRON_PATTERN = "*/30 * * * *";
