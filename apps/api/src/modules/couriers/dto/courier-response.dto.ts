import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CourierModalityResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['AGENCY', 'HOME'] })
  modality: 'AGENCY' | 'HOME';

  @ApiProperty({ type: String, description: 'Decimal price as string' })
  price: string;

  @ApiProperty()
  enabled: boolean;
}

export class CourierResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: [CourierModalityResponseDto] })
  modalities: CourierModalityResponseDto[];
}
