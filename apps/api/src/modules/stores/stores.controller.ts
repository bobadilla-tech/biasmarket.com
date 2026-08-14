import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  AuthGuard,
  Public,
  Roles,
  Session,
} from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import {
  ApiConsumes,
  ApiHeader,
  ApiOkResponse,
  ApiQuery,
} from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { StoresService } from "./stores.service.js";
import { UpdateStoreDto } from "./dto/update-store.dto.js";
import { CreateStoreDto } from "./dto/create-store.dto.js";
import { FileInterceptor } from "@nestjs/platform-express";
import { StorageService } from "../../storage/storage.service.js";
import { parsePublicListQuery } from "../../common/public-list-query.js";
import { toStoreDto } from "./stores.mapper.js";
import { SitemapInternalTokenGuard } from "./sitemap-internal-token.guard.js";
import { parseSitemapPagination } from "./sitemap-pagination.js";
import {
  SitemapStoreCountDto,
  SitemapStorePageDto,
} from "./dto/sitemap-response.dto.js";
import type {
  FeaturedStoreResponseDto,
  PublicCategoryResponseDto,
  PublicCollectionListingResponseDto,
  PublicProductPageResponseDto,
  PublicProductVariantResponseDto,
  PublicProductWithVariantsResponseDto,
  PublicStoreListingResponseDto,
  SectionCollectionProductResponseDto,
  SectionCollectionResponseDto,
  StoreDirectoryResponseDto,
  StorePublicDetailResponseDto,
  StoreResponseDto,
  StoreSectionWithCollectionResponseDto,
  StoreWithOwnerResponseDto,
} from "./dto/store-response.dto.js";

interface VariantRow {
  id: string;
  productId: string;
  storeId: string;
  name: string;
  stock: number | null;
  reserved: number;
  priceOverride: { toString(): string } | null;
  imageOverride: string | null;
  attributes: unknown;
}

interface PublicProductRow {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: { toString(): string };
  currency: string;
  images: string[];
  availableUntil: Date | null;
  status: "DRAFT" | "PUBLISHED";
  soldOut: boolean;
  discontinued: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  variants: VariantRow[];
}

interface SectionRow {
  id: string;
  storeId: string;
  type: "COLLECTION" | "BANNER" | "TEXT_BLOCK";
  collectionId: string | null;
  content: unknown;
  position: number;
  hidden: boolean;
  createdAt: Date;
  collection:
    | {
      id: string;
      storeId: string;
      name: string;
      slug: string;
      description: string;
      createdAt: Date;
      products: {
        collectionId: string;
        productId: string;
        position: number;
        product: PublicProductRow;
      }[];
    }
    | null;
}

function toVariantDto(
  variant: VariantRow,
): PublicProductVariantResponseDto {
  return {
    ...variant,
    priceOverride: variant.priceOverride?.toString() ?? null,
    attributes: variant.attributes as Record<string, unknown>,
  };
}

function toPublicProductDto(
  product: PublicProductRow,
): PublicProductWithVariantsResponseDto {
  return {
    ...product,
    price: product.price.toString(),
    availableUntil: product.availableUntil?.toISOString() ?? null,
    discontinued: product.discontinued,
    deletedAt: product.deletedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    variants: product.variants.map(toVariantDto),
  };
}

function toSectionDto(
  section: SectionRow,
): StoreSectionWithCollectionResponseDto {
  const collection: SectionCollectionResponseDto | null = section.collection
    ? {
      ...section.collection,
      createdAt: section.collection.createdAt.toISOString(),
      products: section.collection.products.map(
        (cp): SectionCollectionProductResponseDto => ({
          ...cp,
          product: toPublicProductDto(cp.product),
        }),
      ),
    }
    : null;

  return {
    ...section,
    content: section.content as Record<string, unknown>,
    createdAt: section.createdAt.toISOString(),
    collection,
  };
}

@Controller("stores")
export class StoresController {
  constructor(
    private readonly stores: StoresService,
    private readonly storage: StorageService,
  ) {}

  @UseGuards(AuthGuard)
  @Post()
  async create(
    @Session() session: UserSession,
    @Body() dto: CreateStoreDto,
  ): Promise<StoreResponseDto> {
    const store = await this.stores.create(session.user.id, dto);
    return toStoreDto(store);
  }

  @UseGuards(AuthGuard)
  @Roles(["admin"])
  @Get()
  async findAllForAdmin(): Promise<StoreWithOwnerResponseDto[]> {
    const stores = await this.stores.findAllForAdmin();
    return stores.map((store) => ({
      ...toStoreDto(store),
      owner: store.owner,
    }));
  }

  @UseGuards(AuthGuard)
  @Get("by-slug/:slug")
  async findBySlug(
    @Param("slug") slug: string,
    @Session() session: UserSession,
  ): Promise<StoreResponseDto> {
    const store = await this.stores.findBySlugForOwner(slug, session.user.id);
    return toStoreDto(store);
  }

  @UseGuards(AuthGuard)
  @Patch(":storeId")
  async update(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateStoreDto,
  ): Promise<StoreResponseDto> {
    const store = await this.stores.update(storeId, session.user.id, dto);
    return toStoreDto(store);
  }

  @UseGuards(AuthGuard)
  @Delete(":storeId")
  async delete(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<StoreResponseDto> {
    const store = await this.stores.delete(storeId, session.user.id);
    return toStoreDto(store);
  }

  @Public()
  @Get("public")
  async findAllPublic(): Promise<PublicStoreListingResponseDto[]> {
    const rows = await this.stores.findAllPublic();
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  @Public()
  @UseGuards(SitemapInternalTokenGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiHeader({ name: "X-Internal-Sitemap-Token", required: true })
  @ApiOkResponse({ type: SitemapStoreCountDto })
  @Get("internal/sitemap/count")
  async findPublicSitemapCount(): Promise<SitemapStoreCountDto> {
    return { total: await this.stores.findPublicSitemapCount() };
  }

  @Public()
  @UseGuards(SitemapInternalTokenGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiHeader({ name: "X-Internal-Sitemap-Token", required: true })
  @ApiQuery({ name: "limit", required: true, type: String })
  @ApiQuery({ name: "offset", required: true, type: String })
  @ApiOkResponse({ type: SitemapStorePageDto })
  @Get("internal/sitemap")
  async findPublicSitemapPage(
    @Query("limit") limit: string | undefined,
    @Query("offset") offset: string | undefined,
  ): Promise<SitemapStorePageDto> {
    const parsed = parseSitemapPagination(limit, offset);
    return this.stores.findPublicSitemapPage(parsed.limit, parsed.offset);
  }

  @Public()
  @Get("collections/public")
  async findCollectionsPublic(): Promise<
    PublicCollectionListingResponseDto[]
  > {
    const rows = await this.stores.findCollectionsPublic();
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  @Public()
  @ApiQuery({ name: "limit", required: false, type: String })
  @Get("featured")
  findFeatured(
    @Query("limit") limit: string | undefined,
  ): Promise<FeaturedStoreResponseDto[]> {
    const parsed = parsePublicListQuery(limit, undefined, undefined);
    return this.stores.findFeatured(parsed.limit);
  }

  @Public()
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: String })
  @Get("directory")
  findDirectory(
    @Query("q") q: string | undefined,
    @Query("page") page: string | undefined,
    @Query("limit") limit: string | undefined,
  ): Promise<StoreDirectoryResponseDto> {
    const parsed = parsePublicListQuery(limit, page, q);
    return this.stores.findDirectory(parsed.page, parsed.limit, parsed.q);
  }

  @Public()
  @Get(":slug/public")
  async findPublic(
    @Param("slug") slug: string,
  ): Promise<StorePublicDetailResponseDto> {
    const { sections, ...store } = await this.stores.findPublicBySlug(slug);
    return { ...toStoreDto(store), sections: sections.map(toSectionDto) };
  }

  @Public()
  @Get(":slug/categories/public")
  findCategoriesPublic(
    @Param("slug") slug: string,
  ): Promise<PublicCategoryResponseDto[]> {
    return this.stores.findCategoriesPublic(slug);
  }

  @Public()
  @Get(":slug/products/:productId/public")
  async findPublicProduct(
    @Param("slug") slug: string,
    @Param("productId") productId: string,
  ): Promise<PublicProductPageResponseDto> {
    const { store, product } = await this.stores.findPublicProduct(
      slug,
      productId,
    );
    return { store, product: toPublicProductDto(product) };
  }

  @UseGuards(AuthGuard)
  @Post(":storeId/logo")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async uploadLogo(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<StoreResponseDto> {
    if (!file) throw new BadRequestException("Falta el archivo");
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException("Máximo 5MB");
    }

    const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
    const isPng = file.buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    if (!isJpeg && !isPng) throw new BadRequestException("Solo JPEG o PNG");

    const url = await this.storage.uploadLogo(
      file.buffer,
      isPng ? "image/png" : "image/jpeg",
    );
    const store = await this.stores.updateLogo(storeId, session.user.id, url);
    return toStoreDto(store);
  }
}
