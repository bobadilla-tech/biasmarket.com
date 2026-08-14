import { ApiProperty } from "@nestjs/swagger";

// Shared between `CustomerAuth` (this module — `me`) and `CustomerAccount`
// (`orders/infrastructure/customer-account.controller.ts` — `confirm`):
// `CustomerAuthService.getProfile` and `CustomerAccountService.confirmAccount`
// both select the exact same narrow order projection (id/paymentStatus/
// fulfillmentStatus/totalAmount/currency/createdAt — no items/payments/
// payment-summary fields, unlike `Order`'s own response DTOs), so this is
// modeled once and imported by both controllers rather than duplicated.
export class AccountOrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    enum: [
      "PENDING_PAYMENT",
      "PARTIALLY_PAID",
      "PAYMENT_SUBMITTED",
      "VERIFIED",
      "REJECTED",
      "CANCELLED",
    ],
  })
  paymentStatus:
    | "PENDING_PAYMENT"
    | "PARTIALLY_PAID"
    | "PAYMENT_SUBMITTED"
    | "VERIFIED"
    | "REJECTED"
    | "CANCELLED";

  @ApiProperty({ enum: ["ORDERING", "IN_TRANSIT", "READY", "COMPLETED"] })
  fulfillmentStatus: "ORDERING" | "IN_TRANSIT" | "READY" | "COMPLETED";

  @ApiProperty({ type: String })
  totalAmount: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

// Structural, not `Prisma.Order` — both call sites select this exact field
// set via a Prisma `select`, and typing this against the real Prisma model
// (or its enum types) is what breaks `PluginMetadataGenerator` (see
// docs/plans/2026-08-04-nestjs-openapi-client-generation-plan.md's Phase 0/1
// execution notes).
export interface AccountOrderRow {
  id: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  totalAmount: { toString(): string };
  currency: string;
  createdAt: Date;
}

export function toAccountOrderDto(
  order: AccountOrderRow,
): AccountOrderResponseDto {
  return {
    id: order.id,
    paymentStatus: order
      .paymentStatus as AccountOrderResponseDto["paymentStatus"],
    fulfillmentStatus: order
      .fulfillmentStatus as AccountOrderResponseDto["fulfillmentStatus"],
    totalAmount: order.totalAmount.toString(),
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
  };
}
