import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { buildRedisConnection, QUEUE_NAMES } from "@biasmarket/queue";

// Same rationale as apps/api's mailer/storage modules — no per-module import
// needed. Registers the Redis connection every @Processor in this app
// consumes, plus one BullMQ queue entry per name in QUEUE_NAMES so
// `@Processor(QUEUE_NAMES.X)` has something to attach to.
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: buildRedisConnection(),
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NAMES.PING }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
