import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString } from "class-validator";

export class AdminAssistedOrderMetricsQueryDto {
  @ApiPropertyOptional({
    description: "Start date filter (ISO 8601 string, e.g. 2026-11-01)",
    example: "2026-11-01T00:00:00.000Z",
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: "End date filter (ISO 8601 string, e.g. 2026-11-07)",
    example: "2026-11-07T23:59:59.999Z",
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: "Optional store ID to filter metrics by a single store",
    example: "cm0123456789abcdef",
  })
  @IsOptional()
  @IsString()
  storeId?: string;
}

export class TimeToPaymentSummaryDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "Average minutes from creation to first valid payment for assisted orders",
  })
  assistedAvgMinutes: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "Median minutes from creation to first valid payment for assisted orders",
  })
  assistedMedianMinutes: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "Average minutes from creation to first valid payment for marketplace orders",
  })
  marketplaceAvgMinutes: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "Median minutes from creation to first valid payment for marketplace orders",
  })
  marketplaceMedianMinutes: number | null;
}

export class PaymentSourceBreakdownDto {
  @ApiProperty({ description: "Count of active payments recorded by seller" })
  sellerRecordedCount: number;

  @ApiProperty({ description: "Count of active payments submitted by buyer" })
  buyerSubmittedCount: number;

  @ApiProperty({
    description: "Proportion of active payments recorded by seller (0.0 - 1.0)",
  })
  sellerRecordedRate: number;

  @ApiProperty({
    description: "Proportion of active payments submitted by buyer (0.0 - 1.0)",
  })
  buyerSubmittedRate: number;
}

export class FunnelMomentMetricsDto {
  @ApiProperty({
    description: "Moment of the invite in the order flow",
    example: "pago_validado",
  })
  moment: string;

  @ApiProperty({ description: "Distinct orders where the invite was shown" })
  shownCount: number;

  @ApiProperty({ description: "Distinct orders where save button was clicked" })
  clickedCount: number;

  @ApiProperty({ description: "Distinct orders where 'Ahora no' was clicked" })
  dismissedCount: number;

  @ApiProperty({ description: "Distinct orders claimed with Google" })
  claimedCount: number;
}

export class InvitationFunnelMetricsDto {
  @ApiProperty({
    type: () => [FunnelMomentMetricsDto],
    description: "Breakdown of the save invitation funnel by moment",
  })
  byMoment: FunnelMomentMetricsDto[];

  @ApiProperty({
    type: () => FunnelMomentMetricsDto,
    description: "Aggregated totals across all invitation moments",
  })
  totals: FunnelMomentMetricsDto;
}

export class CurrencyAmountDto {
  @ApiProperty({
    description: "ISO 4217 currency code of the settled payments",
    example: "PEN",
  })
  currency: string;

  @ApiProperty({
    description: "Settled amount in this currency, rounded to cents",
    example: 1350.5,
  })
  amount: number;
}

export class WeeklyStoreBreakdownDto {
  @ApiProperty({
    description: "ISO week start date (YYYY-MM-DD, Monday in UTC)",
    example: "2026-11-02",
  })
  weekStartDate: string;

  @ApiProperty({ description: "Store identifier" })
  storeId: string;

  @ApiProperty({ description: "Store name" })
  storeName: string;

  @ApiProperty({ description: "Volume of vendor-assisted orders" })
  assistedOrdersCount: number;

  @ApiProperty({ description: "Volume of marketplace orders" })
  marketplaceOrdersCount: number;

  @ApiProperty({
    type: () => [CurrencyAmountDto],
    description:
      "Settled assisted-order revenue summed separately per payment currency",
  })
  assistedRevenueByCurrency: CurrencyAmountDto[];

  @ApiProperty({
    type: () => [CurrencyAmountDto],
    description:
      "Settled marketplace revenue summed separately per payment currency",
  })
  marketplaceRevenueByCurrency: CurrencyAmountDto[];

  @ApiProperty({
    description: "Count of distinct buyer entities in this store and week",
  })
  distinctBuyers: number;

  @ApiProperty({
    description:
      "Count of repeat buyer entities (>= 2 orders) in this store and week",
  })
  repeatBuyers: number;

  @ApiProperty({ description: "Proportion of repeat buyers (0.0 - 1.0)" })
  repeatBuyerRate: number;
}

export class AdminAssistedOrderMetricsSummaryDto {
  @ApiProperty({ description: "Total assisted orders in the selected period" })
  totalAssistedOrders: number;

  @ApiProperty({
    description: "Total marketplace orders in the selected period",
  })
  totalMarketplaceOrders: number;

  @ApiProperty({
    description: "Assisted orders where the private link was opened",
  })
  linkOpenedCount: number;

  @ApiProperty({
    description: "Proportion of assisted orders whose link was opened",
  })
  linkOpenedRate: number;

  @ApiProperty({ description: "Assisted orders claimed with Google" })
  totalClaimedCount: number;

  @ApiProperty({ description: "Overall claim rate across all assisted orders" })
  overallClaimRate: number;

  @ApiProperty({
    description: "Assisted orders that have at least one validated payment",
  })
  ordersWithValidatedPaymentCount: number;

  @ApiProperty({
    description: "Assisted orders with validated payment claimed with Google",
  })
  claimedWithValidatedPaymentCount: number;

  @ApiProperty({
    description: "Claim rate among assisted orders with validated payment",
  })
  validatedClaimRate: number;

  @ApiProperty({
    description: "Target claim rate hypothesis benchmark (0.30)",
    example: 0.3,
  })
  targetClaimRateHypothesis: number;

  @ApiProperty({
    description:
      "Flag indicating whether validatedClaimRate is below the 0.30 target hypothesis (false when 0 validated orders)",
  })
  belowTargetClaimRate: boolean;

  @ApiProperty({
    description: "Assisted orders with manual buyer notice event (G1)",
  })
  buyerNoticeCount: number;

  @ApiProperty({
    description: "Proportion of assisted orders with manual buyer notice",
  })
  buyerNoticeRate: number;

  @ApiProperty({ description: "Assisted orders with confirmed reception (G3)" })
  confirmedReceivedCount: number;

  @ApiProperty({
    description: "Proportion of assisted orders with confirmed reception",
  })
  confirmedReceivedRate: number;

  @ApiProperty({
    type: () => TimeToPaymentSummaryDto,
    description: "Time from order creation to first valid payment",
  })
  timeToFirstValidPayment: TimeToPaymentSummaryDto;

  @ApiProperty({
    type: () => PaymentSourceBreakdownDto,
    description: "Origin breakdown of registered payments on assisted orders",
  })
  paymentSources: PaymentSourceBreakdownDto;
}

export class AdminAssistedOrderMetricsResponseDto {
  @ApiProperty({
    type: () => AdminAssistedOrderMetricsSummaryDto,
    description: "Summary indicators and conversion rates for assisted orders",
  })
  summary: AdminAssistedOrderMetricsSummaryDto;

  @ApiProperty({
    type: () => InvitationFunnelMetricsDto,
    description: "Save-order invitation funnel broken down by moment",
  })
  invitationFunnel: InvitationFunnelMetricsDto;

  @ApiProperty({
    type: () => [WeeklyStoreBreakdownDto],
    description:
      "Weekly volume, revenue, and repeat buyer comparison grouped by store",
  })
  weeklyStoreBreakdown: WeeklyStoreBreakdownDto[];
}
