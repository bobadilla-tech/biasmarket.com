import { Module } from "@nestjs/common";
import { StoreReferencesController } from "./store-references.controller.js";
import { StoreReferencesService } from "./store-references.service.js";

@Module({
  controllers: [StoreReferencesController],
  providers: [StoreReferencesService],
})
export class StoreReferencesModule {}
