import { ApiProperty } from '@nestjs/swagger';

// Date-as-string convention — see
// `../../collections/dto/collection-response.dto.ts`.
export class StoreSectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ enum: ['COLLECTION', 'BANNER', 'TEXT_BLOCK'] })
  type: 'COLLECTION' | 'BANNER' | 'TEXT_BLOCK';

  @ApiProperty({ type: String, nullable: true })
  collectionId: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  content: Record<string, unknown>;

  @ApiProperty()
  position: number;

  @ApiProperty()
  hidden: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}
