import { ApiProperty } from '@nestjs/swagger';

export class PublicCourierModalityDto {
  @ApiProperty({ enum: ['AGENCY', 'HOME'] })
  modality: 'AGENCY' | 'HOME';

  @ApiProperty({ type: String, description: 'Decimal price as string' })
  price: string;
}

export class PublicCourierDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [PublicCourierModalityDto] })
  modalities: PublicCourierModalityDto[];
}
