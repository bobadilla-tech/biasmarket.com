import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import {
  buildRedisConnection,
  defaultJobOptions,
  mailerJobOptions,
  QUEUE_NAMES,
} from "@biasmarket/queue";

@Global() // same rationale as MailerModule/StorageModule — no per-module import needed
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: buildRedisConnection(),
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NAMES.PING }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.MAILER,
      defaultJobOptions: mailerJobOptions,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.ORDERS,
      defaultJobOptions,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
