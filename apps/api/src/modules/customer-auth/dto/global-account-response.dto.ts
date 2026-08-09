import { ApiProperty } from "@nestjs/swagger";
import {
  AccountOrderResponseDto,
  type AccountOrderRow,
} from "./account-order-response.dto.js";

export class LinkedStoreResponseDto {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  name: string;
}

// `GET account/me` — the first slug-independent buyer endpoint. See
// docs/plans/2026-08-08-global-buyer-account-plan.md.
export class GlobalAccountProfileResponseDto {
  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty()
  phone: string;

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

export interface GlobalAccountOrderRow extends AccountOrderRow {
  storeSlug: string;
  storeName: string;
}

export function toGlobalAccountOrderDto(
  order: GlobalAccountOrderRow,
): GlobalAccountOrderResponseDto {
  return {
    id: order.id,
    paymentStatus: order.paymentStatus as GlobalAccountOrderResponseDto[
      "paymentStatus"
    ],
    fulfillmentStatus: order.fulfillmentStatus as GlobalAccountOrderResponseDto[
      "fulfillmentStatus"
    ],
    totalAmount: order.totalAmount.toString(),
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    storeSlug: order.storeSlug,
    storeName: order.storeName,
  };
}
