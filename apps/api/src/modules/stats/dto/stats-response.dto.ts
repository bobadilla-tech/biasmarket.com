import { ApiProperty } from "@nestjs/swagger";
import { OrderResponseDto } from "../../orders/dto/order-response.dto.js";

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
}

export class AnalyticsBucketResponseDto {
  @ApiProperty({ type: String, format: "date-time" })
  start: string;

  @ApiProperty({ type: String, format: "date-time" })
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
  @ApiProperty({ enum: ["30d", "90d", "12m"] })
  range: "30d" | "90d" | "12m";

  @ApiProperty({ type: [AnalyticsBucketResponseDto] })
  buckets: AnalyticsBucketResponseDto[];

  @ApiProperty({ type: [AnalyticsTopProductResponseDto] })
  topProducts: AnalyticsTopProductResponseDto[];
}
