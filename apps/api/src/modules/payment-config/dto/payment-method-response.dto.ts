import { ApiProperty } from '@nestjs/swagger';

// Same conventions as delivery-config/dto/delivery-method-response.dto.ts —
// literal union instead of the Prisma-generated `PaymentMethodType`,
// `details` as an open JSON object.
export class PaymentMethodConfigResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ enum: ['YAPE', 'PLIN', 'TRANSFER', 'CASH'] })
  method: 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH';

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true })
  details: Record<string, unknown>;

  @ApiProperty()
  depositPercentPickup: number;

  @ApiProperty()
  depositPercentCourier: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}
