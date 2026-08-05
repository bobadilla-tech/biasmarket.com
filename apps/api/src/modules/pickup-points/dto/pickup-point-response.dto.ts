import { ApiProperty } from "@nestjs/swagger";

export class PickupPointResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}
