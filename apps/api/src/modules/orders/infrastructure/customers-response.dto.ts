import { ApiProperty } from "@nestjs/swagger";
import { OrderResponseDto } from "../dto/order-response.dto.js";

// Money/Decimal, Date-as-ISO-string, and literal-union conventions — see
// collections/dto/collection-response.dto.ts for the full rationale.

// `findAll`'s shape (`CustomersService.findAllForStore`).
export class CustomerListItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;

  @ApiProperty()
  orderCount: number;

  @ApiProperty()
  lifetimeSpend: number;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  lastOrderAt: string | null;
}

export class CustomerDetailCustomerResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

// `findOne`'s shape (`CustomersService.findOneForStore`). `orders` reuses
// `Order`'s own `OrderResponseDto` rather than a local duplicate: reading
// `findOneForStore` alongside `OrderRepository.findManyForStore` confirms the
// two run the exact same `withPaymentSummary`-over-`{items: {product,
// variant}, payments}` shape (no `proofs` on either side) — a genuine
// same-shape case, not just a similar one, so a cross-module import was
// chosen over re-declaring nine-plus fields a second time. This is the first
// case in this rollout where two tags share an entire response shape, not
// just a nested piece of one (see
// docs/plans/2026-08-06-orval-rollout-batches-5-6-plan.md's Batch 5 section).
export class CustomerDetailResponseDto {
  @ApiProperty({ type: CustomerDetailCustomerResponseDto })
  customer: CustomerDetailCustomerResponseDto;

  @ApiProperty({ type: [OrderResponseDto] })
  orders: OrderResponseDto[];
}
