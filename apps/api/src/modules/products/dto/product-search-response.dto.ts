import { ApiProperty } from "@nestjs/swagger";

// Money/Decimal, Date-as-ISO-string, and literal-union conventions — see
// collections/dto/collection-response.dto.ts for the full rationale.

export class SearchProductStoreResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
}

export class SearchProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String })
  price: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty({ type: SearchProductStoreResponseDto })
  store: SearchProductStoreResponseDto;
}

export class ProductSearchResultResponseDto {
  @ApiProperty({ type: [SearchProductResponseDto] })
  products: SearchProductResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
