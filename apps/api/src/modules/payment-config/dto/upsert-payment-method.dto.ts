import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { PaymentMethodType } from '@biasmarket/db';
import { PaymentMethodDetailsDto } from './payment-method-details.dto.js';

export const PAYMENT_METHOD_TYPES: PaymentMethodType[] = [
  'YAPE',
  'PLIN',
  'TRANSFER',
  'CASH',
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

  @ApiPropertyOptional({
    description:
      'Porcentaje de adelanto que el comprador paga al hacer el pedido (1-100). 20 = paga 20% ahora.',
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  depositPercent?: number;
}
