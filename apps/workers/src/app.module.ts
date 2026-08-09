import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module.js";
import { QueueModule } from "./queue/queue.module.js";
import { PingModule } from "./jobs/ping/ping.module.js";

@Module({
  imports: [HealthModule, QueueModule, PingModule],
})
export class AppModule {}
