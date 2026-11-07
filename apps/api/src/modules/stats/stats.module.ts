import { Module } from "@nestjs/common";
import { AdminStatsController } from "./admin-stats.controller.js";
import { StatsController } from "./stats.controller.js";
import { StatsService } from "./stats.service.js";
import { SuggestionsController } from "./suggestions.controller.js";
import { SuggestionsService } from "./suggestions.service.js";

@Module({
  controllers: [StatsController, SuggestionsController, AdminStatsController],
  providers: [StatsService, SuggestionsService],
})
export class StatsModule {}
