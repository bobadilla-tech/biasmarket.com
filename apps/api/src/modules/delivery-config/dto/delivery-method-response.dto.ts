import { ApiProperty } from '@nestjs/swagger';

// Money/Decimal convention doesn't apply here (no Decimal fields on this
// model) but the Date-as-ISO-string convention still does — see
// collections/dto/collection-response.dto.ts for the full rationale.
export class DeliveryMethodConfigResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  // Literal union, not the Prisma-generated `DeliveryMethodType` type —
  // importing that type re-triggers the PluginMetadataGenerator
  // pnpm-virtual-store bug documented on CollectionResponseDto's
  // `status` field.
  @ApiProperty({ enum: ['PICKUP', 'COURIER'] })
  type: 'PICKUP' | 'COURIER';

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true })
  details: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}
