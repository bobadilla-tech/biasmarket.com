import { ApiProperty } from "@nestjs/swagger";

// Money/Decimal convention (applies repo-wide, not just here): Prisma
// `Decimal` fields serialize over HTTP as JSON strings, not numbers — a
// response DTO field typed `number` makes @nestjs/swagger emit `type:
// number` and every generated-client caller do arithmetic on what is
// actually a string at runtime. `price` below is typed `string`
// (`@ApiProperty({ type: String })`), never `number` or bare `Prisma.Decimal`
// — every later module's response DTOs must apply the same convention.
// (Typing the field `Prisma.Decimal` directly was tried first and rejected:
// the plugin's model visitor follows the type through to its physical
// declaration file inside the pnpm virtual store and embeds that path as a
// dynamic-import specifier in the generated metadata.ts, which then fails to
// resolve — `tsc --noEmit` errors on a `.pnpm/@prisma+client-runtime-utils@.../...`
// module specifier. Explicit-string typing sidesteps it entirely, so the
// controller does the `Decimal`→`string`/`Date`→ISO-string mapping before
// returning — see `CollectionsController.findAll`.)

export class ProductInCollectionResponseDto {
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

  // Literal union, not the Prisma-generated `ProductStatus` type: importing
  // that type here reproduces the same pnpm-virtual-store metadata bug noted
  // above (the plugin's model visitor resolves through the Prisma generated
  // barrel and grabs a neighboring `@prisma/client-runtime-utils` import).
  // "DRAFT" | "PUBLISHED" is structurally identical to Prisma's `ProductStatus`
  // (itself `(typeof ProductStatus)[keyof typeof ProductStatus]`), so this
  // stays honest to the real return type without re-triggering the bug.
  @ApiProperty({ enum: ["DRAFT", "PUBLISHED"] })
  status: "DRAFT" | "PUBLISHED";

  @ApiProperty()
  soldOut: boolean;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deletedAt: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

export class CollectionProductResponseDto {
  @ApiProperty()
  collectionId: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  position: number;
}

export class CollectionProductWithProductResponseDto extends CollectionProductResponseDto {
  @ApiProperty({ type: ProductInCollectionResponseDto })
  product: ProductInCollectionResponseDto;
}

export class CollectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: Date;
}

export class CollectionWithProductsResponseDto extends CollectionResponseDto {
  @ApiProperty({ type: [CollectionProductWithProductResponseDto] })
  products: CollectionProductWithProductResponseDto[];
}
