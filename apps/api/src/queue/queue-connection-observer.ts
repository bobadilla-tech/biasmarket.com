import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import { observeRedisConnection, QUEUE_NAMES } from "@biasmarket/queue";

@Injectable()
export class QueueConnectionObserver {
  private readonly logger = new Logger(QueueConnectionObserver.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.PING) pingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.MAILER) mailerQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ORDERS) ordersQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PUSH) pushQueue: Queue,
  ) {
    const queues = [
      [QUEUE_NAMES.PING, pingQueue],
      [QUEUE_NAMES.MAILER, mailerQueue],
      [QUEUE_NAMES.ORDERS, ordersQueue],
      [QUEUE_NAMES.PUSH, pushQueue],
    ] as const;

    for (const [name, queue] of queues) {
      observeRedisConnection(queue.backend, name, {
        error: (fields) => this.logger.error(fields),
        warn: (fields) => this.logger.warn(fields),
      });
    }
  }
}
