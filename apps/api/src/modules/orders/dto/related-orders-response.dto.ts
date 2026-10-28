import { ApiProperty } from '@nestjs/swagger';

// `GET /stores/:storeId/orders/:orderId/related` — other orders of the same
// buyer phone in the same store, for the seller's order detail. Allow-listed:
// no phone, name or payments.

export class RelatedOrderResponseDto {
  @ApiProperty()
  id: string;

  // Last 4 characters of the id, uppercase, without `#`.
  @ApiProperty()
  orderNumber: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ enum: ['ACTIVE', 'CANCELLED'] })
  status: 'ACTIVE' | 'CANCELLED';

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

  @ApiProperty({ type: String })
  totalAmount: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: ['MARKETPLACE', 'VENDOR_ASSISTED'] })
  source: 'MARKETPLACE' | 'VENDOR_ASSISTED';
}

export class RelatedOrdersResponseDto {
  @ApiProperty({ type: [RelatedOrderResponseDto] })
  items: RelatedOrderResponseDto[];

  // Orders of the same phone in this store, excluding the current one. It can
  // differ by one from `customers/lookup`'s `previousOrders`, which counts
  // every order for the phone before a new one exists. For legacy rows (no
  // `customerPhoneNormalized`) it is a lower bound beyond the scan cap.
  @ApiProperty()
  total: number;
}
