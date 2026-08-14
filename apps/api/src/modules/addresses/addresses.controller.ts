import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { CustomerSessionGuard } from '../customer-auth/customer-session.guard.js';
import { CustomerSession } from '../customer-auth/customer-session.decorator.js';
import { AddressesService } from './addresses.service.js';
import { CreateAddressDto } from './dto/create-address.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';
import { AddressResponseDto } from './dto/address-response.dto.js';

// `slug` isn't read by any handler here (the customer session already
// carries the buyer's global identity, addresses aren't store-scoped) — same
// `@ApiParam`-without-`@Param` fix as customer-auth.controller.ts, needed for
// every `{slug}` path segment or Orval's spec validator rejects the spec. See
// customer-auth.controller.ts's comment for the full story.
@Controller('stores/:slug/account/addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @ApiParam({ name: 'slug', type: String })
  @Public()
  @UseGuards(CustomerSessionGuard)
  @Get()
  async findAll(
    @CustomerSession() session: { buyerAccountId: string },
  ): Promise<AddressResponseDto[]> {
    return this.addressesService.findAllByBuyerAccount(session.buyerAccountId);
  }

  @ApiParam({ name: 'slug', type: String })
  @Public()
  @UseGuards(CustomerSessionGuard)
  @Post()
  async create(
    @CustomerSession() session: { buyerAccountId: string },
    @Body() dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressesService.create(session.buyerAccountId, dto);
  }

  @ApiParam({ name: 'slug', type: String })
  @Public()
  @UseGuards(CustomerSessionGuard)
  @Patch(':id')
  async update(
    @CustomerSession() session: { buyerAccountId: string },
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressesService.update(session.buyerAccountId, id, dto);
  }

  @ApiParam({ name: 'slug', type: String })
  @Public()
  @UseGuards(CustomerSessionGuard)
  @Delete(':id')
  async remove(
    @CustomerSession() session: { buyerAccountId: string },
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.addressesService.delete(session.buyerAccountId, id);
  }
}
