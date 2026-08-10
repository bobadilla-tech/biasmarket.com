import { Module } from "@nestjs/common";
import { ExpireOrdersProcessor } from "./expire-orders.processor.js";
import { ExpireOrdersSchedulerService } from "./expire-orders-scheduler.service.js";

@Module({
  providers: [ExpireOrdersProcessor, ExpireOrdersSchedulerService],
})
export class OrdersModule {}
