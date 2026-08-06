import type {
  OrderItemResponseDto,
  OrderPaymentResponseDto,
  OrderResponseDto,
} from "@biasmarket/types";

// Was zod schemas for a plain pass-through read (OrderController.findAll);
// now type aliases onto the generated response DTO — see the OpenAPI note
// in apps/web/AGENTS.md. No `findOne`/detail query exists on the frontend
// (features/orders only ever calls `list`/findAll) — the detail sheet
// derives its data from the cached list row, so `OrderDetailResponseDto`
// (findOne/addPayment's shape, which adds `proofs`) isn't aliased here at
// all; nothing in this feature reads it.
export type OrderItemRow = OrderItemResponseDto;
export type OrderPaymentRow = OrderPaymentResponseDto;
export type Order = OrderResponseDto;
