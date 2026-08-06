import type {
  CustomerDetailResponseDto,
  CustomerListItemResponseDto,
} from "@biasmarket/types";

// `CustomerDetailResponseDto.orders` is `Order`'s own `OrderResponseDto`
// (reused, not duplicated — see customers-response.dto.ts's comment on the
// apps/api side), so this feature has no local order-row shape anymore.
export type CustomerListItem = CustomerListItemResponseDto;
export type CustomerDetail = CustomerDetailResponseDto;
