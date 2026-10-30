import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { parseStoreCatalogQuery } from "./store-catalog-query.js";

const invalidCases: {
  page?: string;
  limit?: string;
  q?: string | string[];
  categories?: string | string[];
  sort?: string;
}[] = [
  { page: "0" },
  { page: "1.5" },
  { limit: "49" },
  { limit: "0" },
  { q: "x".repeat(101) },
  { q: ["album", "photocard"] },
  { categories: Array.from({ length: 21 }, (_, i) => `c${i}`) },
  { sort: "unknown" },
];

describe("parseStoreCatalogQuery", () => {
  it("applies safe defaults", () => {
    expect(
      parseStoreCatalogQuery(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ),
    ).toEqual({
      page: 1,
      limit: 24,
      categories: [],
      sort: "recientes",
    });
  });

  it("parses repeated and comma-separated category slugs and trims the search", () => {
    expect(
      parseStoreCatalogQuery(
        "2",
        "48",
        "  album  ",
        ["k-pop", "album", "k-pop"],
        "precio_asc",
      ),
    ).toEqual({
      page: 2,
      limit: 48,
      q: "album",
      categories: ["k-pop", "album"],
      sort: "precio_asc",
    });
    expect(
      parseStoreCatalogQuery(undefined, undefined, undefined, "a,b", undefined)
        .categories,
    ).toEqual(["a", "b"]);
  });

  it.each(invalidCases)("rejects invalid query values %j", (params) => {
    expect(() =>
      parseStoreCatalogQuery(
        params.page,
        params.limit,
        params.q,
        params.categories,
        params.sort,
      ),
    ).toThrow(BadRequestException);
  });
});
