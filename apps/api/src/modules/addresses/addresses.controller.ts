import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CustomerSessionGuard } from "../customer-auth/customer-session.guard.js";
import { CustomerSession } from "../customer-auth/customer-session.decorator.js";
import { AddressesService } from "./addresses.service.js";
import { CreateAddressDto } from "./dto/create-address.dto.js";
import { UpdateAddressDto } from "./dto/update-address.dto.js";
import { AddressResponseDto } from "./dto/address-response.dto.js";

@ApiTags("addresses")
@Controller("stores/:slug/account/addresses")
@UseGuards(CustomerSessionGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  async findAll(
    @CustomerSession() session: { id: string; storeId: string },
  ): Promise<AddressResponseDto[]> {
    return this.addressesService.findAllByCustomer(session.id);
  }

  @Post()
  async create(
    @CustomerSession() session: { id: string; storeId: string },
    @Body() dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressesService.create(session.id, dto);
  }

  @Patch(":id")
  async update(
    @CustomerSession() session: { id: string; storeId: string },
    @Param("id") id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressesService.update(session.id, id, dto);
  }

  @Delete(":id")
  async remove(
    @CustomerSession() session: { id: string; storeId: string },
    @Param("id") id: string,
  ): Promise<{ success: boolean }> {
    return this.addressesService.delete(session.id, id);
  }
}
