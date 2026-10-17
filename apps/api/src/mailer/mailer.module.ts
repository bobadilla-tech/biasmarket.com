import { Global, Module } from "@nestjs/common";
import { MailerService } from "./mailer.service.js";

@Global() // same rationale as PrismaModule/StorageModule — no per-module import needed
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
