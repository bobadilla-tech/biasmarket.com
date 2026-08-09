import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { PaymentMethodType } from "@biasmarket/db";
import { PaymentMethodDetailsDto } from "./payment-method-details.dto.js";

export const PAYMENT_METHOD_TYPES: PaymentMethodType[] = [
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

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PaymentMethodDetailsDto)
  details?: PaymentMethodDetailsDto;
}
