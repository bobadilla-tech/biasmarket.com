import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ApiQuery } from "@nestjs/swagger";
import { Public } from "@thallesp/nestjs-better-auth";
import { ProductSearchService } from "./product-search.service.js";
import { parsePublicListQuery } from "../../common/public-list-query.js";
import { ProductSearchResultResponseDto } from "./dto/product-search-response.dto.js";

@Controller("products")
export class ProductSearchController {
  constructor(private productSearch: ProductSearchService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: String })
  @ApiQuery({ name: "category", required: false, type: String })
  @ApiQuery({ name: "sort", required: false, enum: ["latest", "bestseller"] })
  @Get("search")
  async search(
    @Query("q") q: string | undefined,
    @Query("page") page: string | undefined,
    @Query("limit") limit: string | undefined,
    @Query("category") category: string | undefined,
    @Query("sort") sort: string | undefined,
  ): Promise<ProductSearchResultResponseDto> {
    const parsed = parsePublicListQuery(limit, page, q, category, sort);
    const result = await this.productSearch.search(
      parsed.page,
      parsed.limit,
      parsed.q,
      parsed.category,
      parsed.sort,
    );
    return {
      ...result,
      products: result.products.map((product) => ({
        ...product,
        price: product.price.toString(),
      })),
    };
  }
}
