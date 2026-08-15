import { Module } from "@nestjs/common";
import { ExpirePremiumProcessor } from "./expire-premium.processor.js";
import { ExpirePremiumSchedulerService } from "./expire-premium-scheduler.service.js";

@Module({
  providers: [ExpirePremiumProcessor, ExpirePremiumSchedulerService],
})
export class PremiumModule {}
