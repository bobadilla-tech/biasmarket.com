import { Module } from "@nestjs/common";
import { PingProcessor } from "./ping.processor.js";

@Module({
  providers: [PingProcessor],
})
export class PingModule {}
