import { IsBoolean, IsIn, IsOptional } from "class-validator";
import type { PaymentMethodType } from "@biasmarket/db";

const PAYMENT_METHOD_TYPES: PaymentMethodType[] = [
  "YAPE",
  "PLIN",
  "TRANSFER",
  "CASH",
];

export class UpsertPaymentMethodDto {
  @IsIn(PAYMENT_METHOD_TYPES)
  method: PaymentMethodType;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
