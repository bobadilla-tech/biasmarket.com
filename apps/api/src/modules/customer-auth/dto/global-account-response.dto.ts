import { ApiProperty } from '@nestjs/swagger';
import {
  AccountOrderResponseDto,
  type AccountOrderRow,
} from './account-order-response.dto.js';
import { PublicOrderTimelineItemDto } from '../../orders/dto/public-order-response.dto.js';

export class LinkedStoreResponseDto {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  name: string;
}

// `GET account/me` — the first slug-independent buyer endpoint. See
// .artifacts/2026/08/20260808--global-buyer-account/plan.md.
export class GlobalAccountProfileResponseDto {
  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ type: String, nullable: true })
  pendingEmail: string | null;

  @ApiProperty({ type: String, nullable: true })
  pendingPhone: string | null;

  @ApiProperty({ type: [LinkedStoreResponseDto] })
  stores: LinkedStoreResponseDto[];
}

// One row of `GET account/orders` — same shape as `AccountOrderResponseDto`
// plus which store the order belongs to, since this list spans every store.
export class GlobalAccountOrderResponseDto extends AccountOrderResponseDto {
  @ApiProperty()
  storeSlug: string;

  @ApiProperty()
  storeName: string;
}

export class GlobalAccountOrderItemResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ type: String })
  unitPrice: string;

  @ApiProperty()
  currency: string;
}

// Origin, amount and void state only: the proof image, the reviewer, the
// rejection note and the void reason stay on the seller side.
export class GlobalAccountOrderPaymentResponseDto {
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

// `GET account/orders/:orderId` — one order of the signed-in buyer account.
export class GlobalAccountOrderDetailResponseDto extends GlobalAccountOrderResponseDto {
  @ApiProperty({ enum: ['ACTIVE', 'CANCELLED'] })
  status: 'ACTIVE' | 'CANCELLED';

  @ApiProperty({ type: String })
  requiredAmount: string;

  @ApiProperty({ type: String, nullable: true })
  trackingNumber: string | null;

  @ApiProperty({ type: String, nullable: true })
  trackingUrl: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  receiptConfirmedAt: string | null;

  @ApiProperty({ type: [GlobalAccountOrderItemResponseDto] })
  items: GlobalAccountOrderItemResponseDto[];

  @ApiProperty({ type: [GlobalAccountOrderPaymentResponseDto] })
  payments: GlobalAccountOrderPaymentResponseDto[];

  @ApiProperty({
    type: [PublicOrderTimelineItemDto],
    description: 'Dated buyer-visible steps, oldest first.',
  })
  timeline: PublicOrderTimelineItemDto[];
}

export interface GlobalAccountOrderRow extends AccountOrderRow {
  storeSlug: string;
  storeName: string;
}

export function toGlobalAccountOrderDto(
  order: GlobalAccountOrderRow & {
    paidAmount: number;
    pendingAmount: number;
    paidPercentage: number;
  },
): GlobalAccountOrderResponseDto {
  return {
    id: order.id,
    paymentStatus:
      order.paymentStatus as GlobalAccountOrderResponseDto['paymentStatus'],
    fulfillmentStatus:
      order.fulfillmentStatus as GlobalAccountOrderResponseDto['fulfillmentStatus'],
    totalAmount: order.totalAmount.toString(),
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    paidAmount: order.paidAmount,
    pendingAmount: order.pendingAmount,
    paidPercentage: order.paidPercentage,
    storeSlug: order.storeSlug,
    storeName: order.storeName,
    source: order.source as GlobalAccountOrderResponseDto['source'],
    claimedAt: order.claimedAt?.toISOString() ?? null,
  };
}
