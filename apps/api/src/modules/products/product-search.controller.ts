import { Controller, Get, Query } from "@nestjs/common";
import { Public } from "@thallesp/nestjs-better-auth";
import type { ProductSearchService } from "./product-search.service.js";
import { parsePublicListQuery } from "../../common/public-list-query.js";

@Controller("products")
export class ProductSearchController {
  constructor(private productSearch: ProductSearchService) {}

  @Public()
  @Get("search")
  search(
    @Query("q") q: string | undefined,
    @Query("page") page: string | undefined,
    @Query("limit") limit: string | undefined,
  ) {
    const parsed = parsePublicListQuery(limit, page, q);
    return this.productSearch.search(parsed.page, parsed.limit, parsed.q);
  }
}
