import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { buildRedisConnection, QUEUE_NAMES } from "@biasmarket/queue";

@Global() // same rationale as MailerModule/StorageModule — no per-module import needed
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
