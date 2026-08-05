import { ApiProperty } from "@nestjs/swagger";

// Money/Decimal + Date/enum convention (repo-wide, see the fuller comment in
// collections/dto/collection-response.dto.ts): Prisma `Decimal` serializes
// over HTTP as a JSON string, and typing a field `Prisma.Decimal`/`Date`/a
// Prisma-generated enum directly breaks `PluginMetadataGenerator`'s model
// visitor (it resolves through to the physical .d.ts inside the pnpm virtual
// store). Every field below is typed `string`/a literal union instead;
// `ProductsController` does the `Decimal`→`string`/`Date`→ISO-string mapping
// before returning.

export class CategoryInProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class ProductCategoryResponseDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  categoryId: string;

  @ApiProperty({ type: CategoryInProductResponseDto })
  category: CategoryInProductResponseDto;
}

export class VariantResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: Number, nullable: true })
  stock: number | null;

  @ApiProperty()
  reserved: number;

  @ApiProperty({ type: String, nullable: true })
  priceOverride: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageOverride: string | null;

  // Prisma `Json` column — always an object of string keys/values as this
  // service writes it, but the column itself has no schema. Typed as a plain
  // object (not `Prisma.JsonValue`) to stay out of the metadata-generator's
  // Prisma-type-resolution failure mode described above.
  @ApiProperty({ type: "object", additionalProperties: { type: "string" } })
  attributes: Record<string, string>;
}

export class ProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: String })
  price: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  availableUntil: string | null;

  @ApiProperty({ enum: ["DRAFT", "PUBLISHED"] })
  status: "DRAFT" | "PUBLISHED";

  @ApiProperty()
  soldOut: boolean;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deletedAt: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

// `create()`'s shape: product + variants, no category join, no
// soldUnits/availableStock (ProductsService.create doesn't compute either).
export class ProductWithVariantsResponseDto extends ProductResponseDto {
  @ApiProperty({ type: [VariantResponseDto] })
  variants: VariantResponseDto[];
}

// `findAllForStore()`/`findOne()`'s shape: the above, plus the category join
// and the two derived fields both methods compute.
export class ProductDetailResponseDto extends ProductWithVariantsResponseDto {
  @ApiProperty({ type: [ProductCategoryResponseDto] })
  categories: ProductCategoryResponseDto[];

  @ApiProperty()
  soldUnits: number;

  @ApiProperty({ type: Number, nullable: true })
  availableStock: number | null;
}
