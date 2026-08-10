import { Module } from "@nestjs/common";
import { MailerProcessor } from "./mailer.processor.js";

@Module({
  providers: [MailerProcessor],
})
export class MailerModule {}
