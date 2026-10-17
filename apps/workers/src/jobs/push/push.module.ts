import { Module } from "@nestjs/common";
import { PushProcessor } from "./push.processor.js";

@Module({ providers: [PushProcessor] })
export class PushModule {}
