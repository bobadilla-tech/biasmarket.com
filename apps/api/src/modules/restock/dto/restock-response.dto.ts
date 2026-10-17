import { ApiProperty } from "@nestjs/swagger";

// Restock request dates serialize as ISO strings (same Date-as-string
// convention as the notifications module — see
// `../notifications/dto/notification-response.dto.ts`). The controller maps
// Prisma `Date` instances before returning; these DTOs are what the OpenAPI
// spec — and the generated client — promise over HTTP.

export class RestockRequestResultResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

export class RestockRequestProductDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  images: string[];
}

export class RestockRequestVariantDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class RestockRequestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;

  @ApiProperty({ type: RestockRequestProductDto })
  product: RestockRequestProductDto;

  @ApiProperty({ type: RestockRequestVariantDto, nullable: true })
  variant: RestockRequestVariantDto | null;
}

export class RestockCountResponseDto {
  @ApiProperty()
  count: number;
}
