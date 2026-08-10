import { z } from "zod";
import type { JobsOptions } from "bullmq";
import { defaultJobOptions } from "../default-job-options.js";

export const MAILER_JOB_NAME = "send";

// Mirrors apps/api's (soon apps/workers') SendEmailParams shape — the job
// payload crosses a process boundary through Redis, so it's validated with
// this schema on both the apps/api enqueue side and the apps/workers pickup
// side, same reasoning as ping.jobs.ts.
export const sendEmailParamsSchema = z.object({
  to: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  subject: z.string().min(1),
  html: z.string().min(1),
  from: z.string().min(1).optional(),
  replyTo: z.string().min(1).optional(),
});

export type SendEmailParams = z.infer<typeof sendEmailParamsSchema>;

// The rendered HTML payload can carry a live account-action token (see the
// migration plan's mailer section) — a Redis-persisted job should not retain
// it past the moment the email is actually sent. Tighter than
// defaultJobOptions: delete immediately on success (no historical-debugging
// need for mailer jobs), keep only a small failure trail.
export const mailerJobOptions: JobsOptions = {
  ...defaultJobOptions,
  removeOnComplete: true,
  removeOnFail: { count: 20 },
};
