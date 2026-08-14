import { ApiProperty } from '@nestjs/swagger';
import { OrderResponseDto } from '../../orders/dto/order-response.dto.js';

// Money/Decimal, Date-as-ISO-string, and literal-union conventions — see
// collections/dto/collection-response.dto.ts for the full rationale.

export class PaymentStatusCountsResponseDto {
  @ApiProperty()
  PENDING_PAYMENT: number;

  @ApiProperty()
  PARTIALLY_PAID: number;

  @ApiProperty()
  PAYMENT_SUBMITTED: number;

  @ApiProperty()
  VERIFIED: number;

  @ApiProperty()
  REJECTED: number;

  @ApiProperty()
  CANCELLED: number;
}

export class FulfillmentStatusCountsResponseDto {
  @ApiProperty()
  ORDERING: number;

  @ApiProperty()
  IN_TRANSIT: number;

  @ApiProperty()
  READY: number;

  @ApiProperty()
  COMPLETED: number;
}

// One row of `StatsOverviewResponseDto.partialPaymentOrders` — every
// PARTIALLY_PAID order still collecting money, with the same per-order
// paid/total/remaining summary the Order Details view shows (via the shared
// `withPaymentSummary` helper). Decimal money fields keep the repo's
// string convention (`totalAmount`/`requiredAmount`), while the
// repository-computed `paidAmount`/`pendingAmount`/`paidPercentage` are plain
// numbers, matching `OrderResponseDto`.
export class OutstandingPartialPaymentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: String, nullable: true })
  customerName: string | null;

  @ApiProperty()
  customerPhone: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ type: String })
  totalAmount: string;

  @ApiProperty({ type: String })
  requiredAmount: string;

  @ApiProperty()
  paidAmount: number;

  @ApiProperty()
  pendingAmount: number;

  @ApiProperty()
  paidPercentage: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

// `getOverview`'s shape (`StatsService.getOverview`). `recentOrders` reuses
// `Order`'s own `OrderResponseDto` — `StatsService.getOverview` runs the same
// `{items: {product, variant}, payments}` include through the shared
// `withPaymentSummary` helper that `Order.findAll`/`Customers.findOne` do
// (see docs/plans/2026-08-06-orval-rollout-batches-5-6-plan.md's Batch 5/6
// section), so this is the same genuine same-shape case as `Customers`, not
// a coincidence worth re-modeling.
export class StatsOverviewResponseDto {
  @ApiProperty()
  revenue: number;

  @ApiProperty()
  totalOrders: number;

  @ApiProperty({ type: PaymentStatusCountsResponseDto })
  paymentStatusCounts: PaymentStatusCountsResponseDto;

  @ApiProperty({ type: FulfillmentStatusCountsResponseDto })
  fulfillmentStatusCounts: FulfillmentStatusCountsResponseDto;

  @ApiProperty()
  lowStockCount: number;

  @ApiProperty({ type: [OrderResponseDto] })
  recentOrders: OrderResponseDto[];

  @ApiProperty({ type: [OutstandingPartialPaymentResponseDto] })
  partialPaymentOrders: OutstandingPartialPaymentResponseDto[];
}

export class AnalyticsBucketResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  start: string;

  @ApiProperty({ type: String, format: 'date-time' })
  end: string;

  @ApiProperty()
  revenue: number;

  @ApiProperty()
  orderCount: number;

  @ApiProperty()
  newCustomers: number;

  @ApiProperty()
  returningCustomers: number;
}

export class AnalyticsTopProductResponseDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  unitsSold: number;
}

// `getAnalytics`'s shape (`StatsService.getAnalytics`).
export class AnalyticsResultResponseDto {
  @ApiProperty({ enum: ['30d', '90d', '12m'] })
  range: '30d' | '90d' | '12m';

  @ApiProperty({ type: [AnalyticsBucketResponseDto] })
  buckets: AnalyticsBucketResponseDto[];

  @ApiProperty({ type: [AnalyticsTopProductResponseDto] })
  topProducts: AnalyticsTopProductResponseDto[];
}

// `getPaymentMethodsBreakdown`'s row shape (`StatsService.getPaymentMethodsBreakdown`).
export class PaymentMethodBreakdownRowResponseDto {
  // Unknown/legacy methods surface as `null` (kept in the breakdown rather than
  // dropped) — see `KNOWN_PAYMENT_METHODS` handling in the service.
  @ApiProperty({
    enum: ['YAPE', 'PLIN', 'TRANSFER', 'CASH', null],
    nullable: true,
  })
  method: 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH' | null;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: number;
}

// `getPaymentMethodsBreakdown`'s shape (`StatsService.getPaymentMethodsBreakdown`).
export class PaymentMethodsBreakdownResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  from: string;

  @ApiProperty({ type: String, format: 'date-time' })
  to: string;

  @ApiProperty()
  totalAmount: number;

  @ApiProperty()
  totalCount: number;

  @ApiProperty({ type: [PaymentMethodBreakdownRowResponseDto] })
  byMethod: PaymentMethodBreakdownRowResponseDto[];
}
