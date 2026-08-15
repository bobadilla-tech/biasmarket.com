import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module.js";
import { QueueModule } from "./queue/queue.module.js";
import { PingModule } from "./jobs/ping/ping.module.js";
import { MailerModule } from "./jobs/mailer/mailer.module.js";
import { OrdersModule } from "./jobs/orders/orders.module.js";
import { PremiumModule } from "./jobs/premium/premium.module.js";

@Module({
  imports: [
    HealthModule,
    QueueModule,
    PingModule,
    MailerModule,
    OrdersModule,
    PremiumModule,
  ],
})
export class AppModule {}
