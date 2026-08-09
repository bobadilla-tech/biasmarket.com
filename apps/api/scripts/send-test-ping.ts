#!/usr/bin/env node

// One-off smoke test for the queue pipeline — enqueues a single "ping" job
// and confirms apps/workers picks it up and completes it. Watch apps/workers'
// logs (or `docker compose logs -f workers`) for the "Processed ping job"
// line. Usage: pnpm --filter api run queue:ping [message]

import "dotenv/config";
import { Queue } from "bullmq";
import { buildRedisConnection, QUEUE_NAMES, PING_JOB_NAME } from "@biasmarket/queue";

const message = process.argv[2] ?? "hello from apps/api";

const queue = new Queue(QUEUE_NAMES.PING, {
  connection: buildRedisConnection(),
});

const job = await queue.add(PING_JOB_NAME, { message });

console.log(`Enqueued ping job ${job.id}: "${message}"`);

await queue.close();
