import { ApiProperty } from "@nestjs/swagger";
import { AccountOrderResponseDto } from "../../customer-auth/dto/account-order-response.dto.js";

// `confirm`'s shape (`CustomerAccountService.confirmAccount`). Reuses
// `AccountOrderResponseDto` from the `customer-auth` module — see that file's
// comment — since this endpoint selects the identical narrow order
// projection. This DTO lives alongside `CustomerAccountController` (not in
// `customer-auth`) because `confirmAccount` itself is owned by this module's
// `CustomerAccountService`.
export class ConfirmAccountCustomerResponseDto {
  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  hasPassword: boolean;
}

export class ConfirmAccountResponseDto {
  @ApiProperty({ enum: ["confirm", "reset", "change-email", "change-phone"] })
  purpose: "confirm" | "reset" | "change-email" | "change-phone";

  @ApiProperty({ type: ConfirmAccountCustomerResponseDto })
  customer: ConfirmAccountCustomerResponseDto;

  @ApiProperty({ type: [AccountOrderResponseDto] })
  orders: AccountOrderResponseDto[];
}
