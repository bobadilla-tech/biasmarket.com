import { ApiProperty } from "@nestjs/swagger";

// Money/Decimal, Date-as-ISO-string, and literal-union conventions — see
// collections/dto/collection-response.dto.ts for the full rationale.
//
// `Order` has more than one real response shape (see
// docs/plans/2026-08-05-orval-rollout-batch-4-order-checkout-plan.md):
// - `findAll`/`findOne`/`addPayment` run every row through
//   `OrderRepository.withPaymentSummary`, adding `paidAmount`/
//   `pendingAmount`/`paidPercentage` — plain `number`s, not the Decimal-
//   as-string convention, because the repository already reduces every
//   payment's Decimal `amount` through `Number(...)` before this DTO ever
//   sees it (same reasoning as `Stores.findFeatured`'s `revenue` field).
// - `findOne` uses `OrderDetailResponseDto`, a thin extension of
//   `OrderResponseDto` (same DTO-extension-chain pattern `products` used for
//   its multiple shapes) — historically added `proofs` (the buyer-submitted
//   `PaymentProof` model), which was deleted as dead schema (never written
//   anywhere in apps/api — the real flow is seller-recorded `OrderPayment`
//   instead) per
//   docs/plans/2026-08-08-payment-proof-image-access-control-plan.md. Kept
//   as its own type in case `findOne` grows real detail-only fields later.
// - `review`/`advance`/`cancel` return the *raw* Prisma `Order` row
//   (`tx.order.update`/`findUniqueOrThrow`, never passed through
//   `withPaymentSummary`) — no `items`, no `payments`, no `proofs`, no
//   computed payment-summary fields. Modeled separately as
//   `OrderStatusResponseDto`, not force-fit into `OrderResponseDto`.
// - `Checkout.create` returns a third, even narrower shape — see
//   checkout-response.dto.ts.

export class OrderProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: String })
  price: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  availableUntil: string | null;

  @ApiProperty({ enum: ["DRAFT", "PUBLISHED"] })
  status: "DRAFT" | "PUBLISHED";

  @ApiProperty()
  soldOut: boolean;

  @ApiProperty()
  discontinued: boolean;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deletedAt: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

export class OrderVariantResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: Number, nullable: true })
  stock: number | null;

  @ApiProperty()
  reserved: number;

  @ApiProperty({ type: String, nullable: true })
  priceOverride: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageOverride: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  attributes: Record<string, unknown>;
}

export class OrderItemResponseDto {
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

  @ApiProperty({ type: OrderProductResponseDto })
  product: OrderProductResponseDto;

  @ApiProperty({ type: OrderVariantResponseDto, nullable: true })
  variant: OrderVariantResponseDto | null;
}

export class OrderPaymentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ type: String })
  amount: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: ["YAPE", "PLIN", "TRANSFER", "CASH"], nullable: true })
  method: "YAPE" | "PLIN" | "TRANSFER" | "CASH" | null;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;

  @ApiProperty({ enum: ["SELLER_RECORDED", "BUYER_SUBMITTED"] })
  source: "SELLER_RECORDED" | "BUYER_SUBMITTED";

  @ApiProperty({
    enum: ["N_A", "PENDING_REVIEW", "APPROVED", "REJECTED"],
  })
  reviewStatus: "N_A" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  reviewedAt: string | null;

  @ApiProperty({ type: String, nullable: true })
  reviewedBy: string | null;
}

// `findAll`'s shape (via OrderRepository.withPaymentSummary) — no `proofs`.
export class OrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ type: String, nullable: true })
  customerId: string | null;

  @ApiProperty({ type: String, nullable: true })
  buyerAccountId: string | null;

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

  @ApiProperty({ type: String, nullable: true })
  retainedAmount: string | null;

  @ApiProperty({ type: String, nullable: true })
  releasedAmount: string | null;

  @ApiProperty({
    enum: ["REFUNDED", "RETAINED", "STORE_CREDIT"],
    nullable: true,
  })
  releasedResolution: "REFUNDED" | "RETAINED" | "STORE_CREDIT" | null;

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

  @ApiProperty()
  paidAmount: number;

  @ApiProperty()
  pendingAmount: number;

  @ApiProperty()
  paidPercentage: number;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];

  @ApiProperty({ type: [OrderPaymentResponseDto] })
  payments: OrderPaymentResponseDto[];
}

// `findOne`/`addPayment`'s shape — see the module comment above for why this
// stays a separate (currently identical) type from `OrderResponseDto`.
export class OrderDetailResponseDto extends OrderResponseDto {}

// `review`/`advance`/`cancel`'s shape — the raw Order row, no joins, no
// computed payment-summary fields (see the module comment above).
export class OrderStatusResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ type: String, nullable: true })
  customerId: string | null;

  @ApiProperty({ type: String, nullable: true })
  buyerAccountId: string | null;

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

  @ApiProperty({ type: String, nullable: true })
  retainedAmount: string | null;

  @ApiProperty({ type: String, nullable: true })
  releasedAmount: string | null;

  @ApiProperty({
    enum: ["REFUNDED", "RETAINED", "STORE_CREDIT"],
    nullable: true,
  })
  releasedResolution: "REFUNDED" | "RETAINED" | "STORE_CREDIT" | null;

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
}
