import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StoreReferenceResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() storeId: string;
  @ApiProperty() imageUrl: string;
  @ApiProperty() width: number;
  @ApiProperty() height: number;
  @ApiProperty({ format: 'date-time' }) takenAt: string;
  @ApiProperty({ enum: ['STORE', 'BUYER'] }) source: 'STORE' | 'BUYER';
  @ApiPropertyOptional({ type: String, nullable: true }) caption: string | null;
  @ApiProperty() hidden: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class PublicStoreReferencesResponseDto {
  @ApiProperty({ type: [StoreReferenceResponseDto] })
  items: StoreReferenceResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
