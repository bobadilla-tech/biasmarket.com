import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiQuery } from "@nestjs/swagger";
import { Public } from "@thallesp/nestjs-better-auth";
import { CustomerAccountService } from "../application/customer-account.service.js";
import { ConfirmAccountResponseDto } from "./customer-account-response.dto.js";
import { toAccountOrderDto } from "../../customer-auth/dto/account-order-response.dto.js";

@Controller("stores/:slug/account")
export class CustomerAccountController {
  constructor(private customerAccounts: CustomerAccountService) {}

  @Public()
  @ApiQuery({ name: "token", required: false, type: String })
  @Get("confirm")
  async confirm(
    @Param("slug") slug: string,
    @Query("token") token: string | undefined,
  ): Promise<ConfirmAccountResponseDto> {
    const result = await this.customerAccounts.confirmAccount(slug, token);
    return {
      purpose: result.purpose,
      customer: result.customer,
      orders: result.orders.map(toAccountOrderDto),
    };
  }
}
