import { ApiProperty } from '@nestjs/swagger';

// Literal union instead of the Prisma-generated `WhatsAppMessageType` enum
// (same convention as delivery-config/payment-config response DTOs). The
// controller maps Prisma `Date`/enum rows before returning; this DTO is what
// the OpenAPI spec — and the generated client — promise over HTTP.
export class WhatsAppTemplateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ enum: ['NEW_ORDER', 'PAYMENT_REMINDER'] })
  type: 'NEW_ORDER' | 'PAYMENT_REMINDER';

  @ApiProperty()
  template: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: string;
}
