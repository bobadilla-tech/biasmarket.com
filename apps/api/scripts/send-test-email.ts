#!/usr/bin/env node

// One-off smoke test for the mailer queue pipeline — enqueues a real mailer
// job the same way MailerService.send() does (not a bare Queue.add() with a
// hand-crafted payload skipping validation), confirming apps/workers picks
// it up and sends/writes it. Watch apps/workers' logs (or
// `docker compose logs -f workers`) for the "Sent mailer job" line; in
// MAIL_DRIVER=file mode, check apps/workers/.mailer-dev/ afterward.
// Usage: pnpm --filter api run mail:test <to-email>

import "dotenv/config";
import { Queue } from "bullmq";
import {
  buildRedisConnection,
  MAILER_JOB_NAME,
  QUEUE_NAMES,
  sendEmailParamsSchema,
} from "@biasmarket/queue";

const to = process.argv[2];

if (!to) {
  console.error("Usage: node scripts/send-test-email.ts <to-email>");
  process.exit(1);
}

const params = sendEmailParamsSchema.parse({
  to,
  subject: "Bias Market — mailer smoke test",
  html: "<p>If you can read this, the mailer queue pipeline works.</p>",
});

const queue = new Queue(QUEUE_NAMES.MAILER, {
  connection: buildRedisConnection(),
});

const job = await queue.add(MAILER_JOB_NAME, params);

console.log(`Enqueued mailer job ${job.id} for ${to}`);

await queue.close();
