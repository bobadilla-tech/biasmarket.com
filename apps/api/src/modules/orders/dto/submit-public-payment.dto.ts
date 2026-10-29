import { ApiProperty } from '@nestjs/swagger';

// OpenAPI shape of the multipart body of `POST /public/orders/:token/payments`.
// Not used as a `@Body()` type: the handler reads fields individually and
// validates them in `BuyerPaymentProofService`.
export class SubmitPublicPaymentDto {
  @ApiProperty({
    description: 'Amount paid, digits with at most two decimals ("40.50").',
    example: '40.50',
  })
  amount: string;

  @ApiProperty({ enum: ['YAPE', 'PLIN', 'TRANSFER', 'CASH'] })
  method: 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH';

  @ApiProperty({
    required: false,
    description: 'Bank or wallet operation number (max 64 characters).',
  })
  operationCode?: string;

  @ApiProperty({ required: false, description: 'Free text, max 500 chars.' })
  note?: string;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'JPEG or PNG proof of payment, up to 5 MB.',
  })
  file: unknown;
}

export class SubmitPublicPaymentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: String })
  amount: string;

  @ApiProperty({ enum: ['PENDING_REVIEW'] })
  reviewStatus: 'PENDING_REVIEW';

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}
