import { ApiProperty } from "@nestjs/swagger";
import { CheckoutOrderResponseDto } from "./checkout-response.dto.js";
import { OrderDetailResponseDto } from "./order-response.dto.js";

// `CreateAssistedOrderUseCase` returns the same narrow
// `order.create({ include: { items: true } })` shape as the checkout, so it
// reuses CheckoutOrderResponseDto rather than the seller list/detail DTOs.
export class CreateAssistedOrderResponseDto {
  @ApiProperty({ type: () => CheckoutOrderResponseDto })
  order: CheckoutOrderResponseDto;

  @ApiProperty({
    description:
      "SECRET: private buyer link. Returned only when the link is created; " +
      "only its hash is stored, so it cannot be shown again.",
  })
  accessUrl: string;

  @ApiProperty({
    description:
      "Earlier orders of this store for the same WhatsApp number (advisory).",
  })
  previousOrders: number;
}

// `regenerate` and `correct-phone` return the full seller order (as the
// detail endpoint does) plus the new private link.
export class AssistedOrderLinkResponseDto {
  @ApiProperty({ type: () => OrderDetailResponseDto })
  order: OrderDetailResponseDto;

  @ApiProperty({
    description:
      "SECRET: the new private buyer link. The previous link stops working. " +
      "Returned only when the link is created; only its hash is stored.",
  })
  accessUrl: string;
}
