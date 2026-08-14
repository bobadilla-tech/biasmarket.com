import { ApiProperty } from "@nestjs/swagger";

// Money/Decimal and Date-as-ISO-string conventions — see
// collections/dto/collection-response.dto.ts for the full rationale.
// Literal unions instead of Prisma-generated enum types for the same reason
// (PluginMetadataGenerator pnpm-virtual-store bug).

export class StoreResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  locale: string;

  @ApiProperty()
  ownerId: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  themeConfig: Record<string, unknown>;

  @ApiProperty({ type: String, nullable: true })
  logoUrl: string | null;

  @ApiProperty()
  paymentInstructions: string;

  @ApiProperty({ type: String, nullable: true })
  whatsappNumber: string | null;

  @ApiProperty({ type: String, nullable: true })
  instagramUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  facebookUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  tiktokUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  twitterUrl: string | null;

  @ApiProperty()
  defaultCurrency: string;

  @ApiProperty()
  holdWindowHours: number;

  @ApiProperty()
  lowStockThreshold: number;

  @ApiProperty()
  lowStockAlertsEnabled: boolean;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

export class StoreOwnerResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;
}

// findAllForAdmin's shape — platform-admin-only, deliberately unfiltered by
// ownership (see StoresService.findAllForAdmin's comment).
export class StoreWithOwnerResponseDto extends StoreResponseDto {
  @ApiProperty({ type: StoreOwnerResponseDto })
  owner: StoreOwnerResponseDto;
}

// findAllPublic's shape — a minimal slug directory, not the full row.
export class PublicStoreListingResponseDto {
  @ApiProperty()
  slug: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

// findCollectionsPublic's shape.
export class PublicCollectionListingResponseDto {
  @ApiProperty()
  storeSlug: string;

  @ApiProperty()
  collectionSlug: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

// findFeatured's shape — store + computed revenue/order-count aggregates
// (not a straight Prisma row, see StoresService.findFeatured). `revenue`
// is a plain `number` here, not the usual Decimal-as-string convention —
// the service already reduces every payment's Decimal `amount` through
// `Number(...)` into a summed JS number for ranking before this DTO ever
// sees it (a display/ranking aggregate, not a stored money value), so
// `number` is what the controller actually returns, not a type lie.
export class FeaturedStoreResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl: string | null;

  @ApiProperty()
  revenue: number;

  @ApiProperty()
  orderCount: number;
}

// findDirectory's shape.
export class DirectoryStoreItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl: string | null;
}

export class StoreDirectoryResponseDto {
  @ApiProperty({ type: [DirectoryStoreItemResponseDto] })
  stores: DirectoryStoreItemResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

// findCategoriesPublic's shape.
export class PublicCategoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  parentId: string | null;
}

// Shared by findPublicProduct and the section->collection->products join in
// findPublicBySlug — both read `{ include: { variants: true } }`, no
// category join. Local to this module (not the products module's own
// response DTOs) — same "each module owns its nested join shapes"
// convention collections' ProductInCollectionResponseDto already
// established, avoiding a cross-module coupling that isn't needed here.
export class PublicProductVariantResponseDto {
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

  @ApiProperty({ type: "object", additionalProperties: true })
  attributes: Record<string, unknown>;
}

export class PublicProductWithVariantsResponseDto {
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

  @ApiProperty()
  discontinued: boolean;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deletedAt: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;

  @ApiProperty({ type: [PublicProductVariantResponseDto] })
  variants: PublicProductVariantResponseDto[];
}

// findPublicProduct's shape.
export class PublicProductStoreResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl: string | null;
}

export class PublicProductPageResponseDto {
  @ApiProperty({ type: PublicProductStoreResponseDto })
  store: PublicProductStoreResponseDto;

  @ApiProperty({ type: PublicProductWithVariantsResponseDto })
  product: PublicProductWithVariantsResponseDto;
}

// findPublicBySlug's section->collection->products join (see
// StoresService.findPublicBySlug). `content` stays `Record<string,
// unknown>` — OpenAPI can't express "shape varies by sibling field" any
// better than StoreSections' own response DTO already had to accept (see
// that module's dto file) — the live storefront page
// (app/[locale]/(storefront)/store/[slug]/page.tsx) keeps narrowing
// `section.content` at the read site rather than here.
export class SectionCollectionProductResponseDto {
  @ApiProperty()
  collectionId: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  position: number;

  @ApiProperty({ type: PublicProductWithVariantsResponseDto })
  product: PublicProductWithVariantsResponseDto;
}

export class SectionCollectionResponseDto {
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
  createdAt: string;

  @ApiProperty({ type: [SectionCollectionProductResponseDto] })
  products: SectionCollectionProductResponseDto[];
}

export class StoreSectionWithCollectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ enum: ["COLLECTION", "BANNER", "TEXT_BLOCK"] })
  type: "COLLECTION" | "BANNER" | "TEXT_BLOCK";

  @ApiProperty({ type: String, nullable: true })
  collectionId: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  content: Record<string, unknown>;

  @ApiProperty()
  position: number;

  @ApiProperty()
  hidden: boolean;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;

  @ApiProperty({ type: SectionCollectionResponseDto, nullable: true })
  collection: SectionCollectionResponseDto | null;
}

// findPublicBySlug's shape.
export class StorePublicDetailResponseDto extends StoreResponseDto {
  @ApiProperty({ type: [StoreSectionWithCollectionResponseDto] })
  sections: StoreSectionWithCollectionResponseDto[];
}
