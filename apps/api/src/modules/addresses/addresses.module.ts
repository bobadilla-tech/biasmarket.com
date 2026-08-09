import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { CustomerAuthModule } from "../customer-auth/customer-auth.module.js";
import { AddressesController } from "./addresses.controller.js";
import { AddressesService } from "./addresses.service.js";

@Module({
  imports: [PrismaModule, CustomerAuthModule],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
