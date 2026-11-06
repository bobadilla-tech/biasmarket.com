import { Module } from "@nestjs/common";
import { ExpireOrdersProcessor } from "./expire-orders.processor.js";
import { ExpireOrdersSchedulerService } from "./expire-orders-scheduler.service.js";
import { PaymentProofSweepProcessor } from "./payment-proof-sweep.processor.js";

@Module({
  providers: [
    ExpireOrdersProcessor,
    PaymentProofSweepProcessor,
    ExpireOrdersSchedulerService,
  ],
})
export class OrdersModule {}
