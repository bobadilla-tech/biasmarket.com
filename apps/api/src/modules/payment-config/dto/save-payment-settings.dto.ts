import {
  IsArray,
  ArrayUnique,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsBoolean,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { PaymentMethodType } from "@biasmarket/db";
import { PAYMENT_METHOD_TYPES } from "./upsert-payment-method.dto.js";

export class PaymentSettingsMethodChangeDto {
  @IsIn(PAYMENT_METHOD_TYPES)
  method: PaymentMethodType;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  expectedEnabled?: boolean;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  expectedDetails?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  depositPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  expectedDepositPercent?: number;
}

export class SavePaymentSettingsDto {
  @IsArray()
  @ArrayUnique((change: PaymentSettingsMethodChangeDto) => change.method)
  @ValidateNested({ each: true })
  @Type(() => PaymentSettingsMethodChangeDto)
  methods: PaymentSettingsMethodChangeDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  expectedPaymentInstructions?: string;
}
