import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { CustomersService } from '../application/customers.service.js';
import {
  CustomerDetailResponseDto,
  CustomerListItemResponseDto,
  CustomerLookupResponseDto,
} from './customers-response.dto.js';
import { toOrderDto } from './order.controller.js';

@Controller('stores/:storeId/customers')
@UseGuards(AuthGuard)
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get()
  async findAll(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
  ): Promise<CustomerListItemResponseDto[]> {
    const rows = await this.customers.findAllForStore(storeId, session.user.id);
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
    }));
  }

  @Get('lookup')
  @ApiQuery({ name: 'phone', required: true, type: String })
  async lookup(
    @Param('storeId') storeId: string,
    @Query('phone') phone: string | undefined,
    @Session() session: UserSession,
  ): Promise<CustomerLookupResponseDto> {
    if (!phone?.trim()) {
      throw new BadRequestException('El teléfono es requerido');
    }
    return this.customers.lookupByPhone(storeId, session.user.id, phone);
  }

  @Get(':customerId')
  async findOne(
    @Param('storeId') storeId: string,
    @Param('customerId') customerId: string,
    @Session() session: UserSession,
  ): Promise<CustomerDetailResponseDto> {
    const result = await this.customers.findOneForStore(
      customerId,
      storeId,
      session.user.id,
    );
    return {
      customer: {
        ...result.customer,
        createdAt: result.customer.createdAt.toISOString(),
      },
      orders: result.orders.map(toOrderDto),
    };
  }
}
