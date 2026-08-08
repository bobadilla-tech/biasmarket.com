import type {
  PaymentMethodBreakdownRowResponseDto,
  PaymentMethodsBreakdownResponseDto,
} from "@biasmarket/types";

// Client-side concern only: the payment methods this UI knows colors/labels for
// (see METHOD_COLORS in payment-methods-breakdown.tsx). The server's contract
// for the breakdown shape is the generated OpenAPI DTOs below — response
// validation is dropped for this pass-through read (see apps/web/AGENTS.md's
// OpenAPI note).
export const paymentMethodValues = [
  "YAPE",
  "PLIN",
  "TRANSFER",
  "CASH",
] as const;
export type PaymentMethodValue = (typeof paymentMethodValues)[number];

export type PaymentMethodBreakdownRow = PaymentMethodBreakdownRowResponseDto;
export type PaymentMethodBreakdown = PaymentMethodsBreakdownResponseDto;
