import { ApiProperty } from "@nestjs/swagger";

// Money/Decimal convention doesn't apply here (no Decimal fields), but the
// Date-as-string convention still does — see
// `../../collections/dto/collection-response.dto.ts` for the full rationale.
export class CategoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ type: String, nullable: true })
  parentId: string | null;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}
