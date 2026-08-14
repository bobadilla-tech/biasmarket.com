import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { CustomersService } from "../application/customers.service.js";
import {
  CustomerDetailResponseDto,
  CustomerListItemResponseDto,
} from "./customers-response.dto.js";
import { toOrderDto } from "./order.controller.js";

@Controller("stores/:storeId/customers")
@UseGuards(AuthGuard)
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get()
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<CustomerListItemResponseDto[]> {
    const rows = await this.customers.findAllForStore(storeId, session.user.id);
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
    }));
  }

  @Get(":customerId")
  async findOne(
    @Param("storeId") storeId: string,
    @Param("customerId") customerId: string,
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
