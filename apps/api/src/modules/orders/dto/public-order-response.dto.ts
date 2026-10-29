import { ApiProperty } from '@nestjs/swagger';

// `GET /public/orders/:token` — the buyer's private-link page, reachable with
// nothing but the token, so every field here is public by construction and
// deliberately allow-listed rather than derived from the `Order` row. In
// particular `deliveryDetails` is a projection: the stored blob also carries
// `shippingAddress.recipientName` / `phone` / `documentNumber`, which must
// never leave the API on a link that gets forwarded through WhatsApp.
//
// Money/Decimal-as-string and Date-as-ISO-string conventions — see
// collections/dto/collection-response.dto.ts.

export class PublicOrderStoreResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  whatsappNumber: string | null;
}

export class PublicOrderItemResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ type: String })
  unitPrice: string;

  @ApiProperty()
  currency: string;
}

export class PublicOrderPaymentResponseDto {
  @ApiProperty({ enum: ['SELLER_RECORDED', 'BUYER_SUBMITTED'] })
  source: 'SELLER_RECORDED' | 'BUYER_SUBMITTED';

  @ApiProperty({ type: String })
  amount: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  voidedAt: string | null;

  @ApiProperty({
    enum: ['N_A', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'],
  })
  reviewStatus: 'N_A' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
}

export const PUBLIC_TIMELINE_EVENT_TYPES = [
  'CREATED',
  'PAYMENT_SUBMITTED',
  'PAYMENT_VALIDATED',
  'PAYMENT_REJECTED',
  'PAYMENT_VOIDED',
  'FULFILLMENT_ADVANCED',
  'PACKED_PHOTO_ADDED',
  'TRACKING_ADDED',
  'RECEIPT_CONFIRMED',
  'CLAIMED',
  'ORDER_CANCELLED',
] as const;
export type PublicTimelineEventType =
  (typeof PUBLIC_TIMELINE_EVENT_TYPES)[number];

// One buyer-visible step. Every key is always present so the shape is stable;
// nothing from the stored payload beyond these picked fields is exposed.
export class PublicOrderTimelineItemDto {
  @ApiProperty({ enum: PUBLIC_TIMELINE_EVENT_TYPES })
  type: PublicTimelineEventType;

  @ApiProperty({ type: String, format: 'date-time' })
  at: string;

  @ApiProperty({
    enum: ['ORDERING', 'IN_TRANSIT', 'READY', 'COMPLETED'],
    nullable: true,
    description: 'New fulfillment step, for FULFILLMENT_ADVANCED only.',
  })
  toStatus: 'ORDERING' | 'IN_TRANSIT' | 'READY' | 'COMPLETED' | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Payment amount, for PAYMENT_SUBMITTED / PAYMENT_VOIDED.',
  })
  amount: string | null;

  @ApiProperty({
    enum: ['REFUNDED', 'RETAINED', 'STORE_CREDIT'],
    nullable: true,
    description: 'Outcome of a cancellation, for ORDER_CANCELLED only.',
  })
  resolution: 'REFUNDED' | 'RETAINED' | 'STORE_CREDIT' | null;
}

export class PublicOrderPaymentMethodResponseDto {
  @ApiProperty({ enum: ['YAPE', 'PLIN', 'TRANSFER', 'CASH'] })
  method: 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH';

  @ApiProperty()
  depositPercent: number;

  // The store's own payment details (Yape number, account, ...). Passed
  // through as stored: it is what the buyer has to read to pay.
  @ApiProperty({ type: 'object', additionalProperties: true })
  details: Record<string, unknown>;
}

export class PublicOrderDeliveryDetailsResponseDto {
  @ApiProperty({ type: String, nullable: true })
  line1: string | null;

  @ApiProperty({ type: String, nullable: true })
  district: string | null;

  @ApiProperty({ type: String, nullable: true })
  city: string | null;

  @ApiProperty({ type: String, nullable: true })
  reference: string | null;

  @ApiProperty({ type: String, nullable: true })
  pickupPointLabel: string | null;
}

export class PublicOrderResponseDto {
  @ApiProperty({ type: PublicOrderStoreResponseDto })
  store: PublicOrderStoreResponseDto;

  // Already masked (`maskPhone`): dial code, first national digit and last
  // three, never the full number.
  @ApiProperty()
  customerPhone: string;

  // `Order.customerName` sanitised for display: single line, no control or
  // bidi characters, at most 40 graphemes. Null when empty.
  @ApiProperty({ type: String, nullable: true })
  customerAlias: string | null;

  // Last 4 characters of the order id, uppercase, without `#`.
  @ApiProperty()
  orderNumber: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: [PublicOrderItemResponseDto] })
  items: PublicOrderItemResponseDto[];

  @ApiProperty({ type: String })
  totalAmount: string;

  @ApiProperty({ type: String })
  requiredAmount: string;

  @ApiProperty()
  paidAmount: number;

  @ApiProperty()
  pendingAmount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({
    enum: [
      'PENDING_PAYMENT',
      'PARTIALLY_PAID',
      'PAYMENT_SUBMITTED',
      'VERIFIED',
      'REJECTED',
      'CANCELLED',
    ],
  })
  paymentStatus:
    | 'PENDING_PAYMENT'
    | 'PARTIALLY_PAID'
    | 'PAYMENT_SUBMITTED'
    | 'VERIFIED'
    | 'REJECTED'
    | 'CANCELLED';

  @ApiProperty({ enum: ['ORDERING', 'IN_TRANSIT', 'READY', 'COMPLETED'] })
  fulfillmentStatus: 'ORDERING' | 'IN_TRANSIT' | 'READY' | 'COMPLETED';

  @ApiProperty({ enum: ['ACTIVE', 'CANCELLED'] })
  status: 'ACTIVE' | 'CANCELLED';

  @ApiProperty({ type: String, nullable: true })
  paymentInstructions: string | null;

  @ApiProperty({ type: [PublicOrderPaymentMethodResponseDto] })
  paymentMethods: PublicOrderPaymentMethodResponseDto[];

  @ApiProperty({ enum: ['PICKUP', 'COURIER'] })
  deliveryMethodType: 'PICKUP' | 'COURIER';

  @ApiProperty({ type: PublicOrderDeliveryDetailsResponseDto })
  deliveryDetails: PublicOrderDeliveryDetailsResponseDto;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  pickupDate: string | null;

  @ApiProperty({ type: String, nullable: true })
  courierName: string | null;

  @ApiProperty({ type: String, nullable: true })
  trackingNumber: string | null;

  @ApiProperty({ type: String, nullable: true })
  trackingUrl: string | null;

  @ApiProperty({
    description: 'Whether a private packed-package photo is available.',
  })
  packedPhotoAvailable: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'When the buyer confirmed receiving the order.',
  })
  receiptConfirmedAt: string | null;

  @ApiProperty({
    description: 'Whether the order was saved to a buyer account.',
  })
  claimed: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Time of the latest buyer-visible step (creation if none).',
  })
  lastUpdateAt: string;

  @ApiProperty({
    type: [PublicOrderTimelineItemDto],
    description:
      'Dated steps, oldest first. Empty unless the order was claimed: it is an incentive to save the order, not an access control.',
  })
  timeline: PublicOrderTimelineItemDto[];

  @ApiProperty({
    description:
      'Whether a payment counts toward the paid amount (recorded, or an approved proof, and not voided).',
  })
  hasValidatedPayment: boolean;

  @ApiProperty({ enum: ['AGENCY', 'HOME'], nullable: true })
  courierModality: 'AGENCY' | 'HOME' | null;

  @ApiProperty({ type: [PublicOrderPaymentResponseDto] })
  payments: PublicOrderPaymentResponseDto[];
}
