import { ApiProperty } from "@nestjs/swagger";

// `CheckoutController.create` (CreateOrderUseCase) returns a third, distinct
// Order shape — `tx.order.create({ ..., include: { items: true } })`, no
// product/variant join on items, no payments/proofs, no computed
// payment-summary fields. Don't reuse order-response.dto.ts's
// OrderResponseDto/OrderStatusResponseDto here — see that file's module
// comment and docs/plans/2026-08-05-orval-rollout-batch-4-order-checkout-plan.md.

export class CheckoutOrderItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty()
  productId: string;

  @ApiProperty({ type: String, nullable: true })
  variantId: string | null;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ type: String })
  unitPriceAtPurchase: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

export class CheckoutOrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ type: String, nullable: true })
  customerId: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerEmail: string | null;

  @ApiProperty()
  customerPhone: string;

  @ApiProperty({ type: String, nullable: true })
  customerName: string | null;

  @ApiProperty({ enum: ["PICKUP", "COURIER"] })
  deliveryMethodType: "PICKUP" | "COURIER";

  @ApiProperty({ type: "object", additionalProperties: true, nullable: true })
  deliveryDetails: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true })
  pickupPointId: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  pickupDate: string | null;

  @ApiProperty({
    enum: ["YAPE", "PLIN", "TRANSFER", "CASH"],
    nullable: true,
  })
  paymentMethod: "YAPE" | "PLIN" | "TRANSFER" | "CASH" | null;

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

  @ApiProperty({ type: String, nullable: true })
  paymentRejectionReason: string | null;

  @ApiProperty({ enum: ["ORDERING", "IN_TRANSIT", "READY", "COMPLETED"] })
  fulfillmentStatus: "ORDERING" | "IN_TRANSIT" | "READY" | "COMPLETED";

  @ApiProperty({ enum: ["ACTIVE", "CANCELLED"] })
  status: "ACTIVE" | "CANCELLED";

  @ApiProperty({
    enum: ["REFUNDED", "RETAINED", "STORE_CREDIT"],
    nullable: true,
  })
  cancellationResolution: "REFUNDED" | "RETAINED" | "STORE_CREDIT" | null;

  @ApiProperty({ type: String, nullable: true })
  cancellationReason: string | null;

  @ApiProperty({ type: String })
  totalAmount: string;

  @ApiProperty({ type: String })
  requiredAmount: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ type: String, format: "date-time" })
  expiresAt: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;

  @ApiProperty({ type: [CheckoutOrderItemResponseDto] })
  items: CheckoutOrderItemResponseDto[];
}

export class CheckoutResultResponseDto {
  @ApiProperty({ type: CheckoutOrderResponseDto })
  order: CheckoutOrderResponseDto;

  @ApiProperty({ type: String, nullable: true })
  whatsappUrl: string | null;
}
