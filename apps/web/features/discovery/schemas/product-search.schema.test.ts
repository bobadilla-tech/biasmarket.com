import { expect, test } from "vitest";
import { productSearchResultSchema } from "./product-search.schema";

test("parses a full product search result", () => {
  const valid = {
    products: [
      {
        id: "product-1",
        name: "Album v1",
        price: "25.00",
        currency: "PEN",
        images: ["https://example.com/a.jpg"],
        store: { name: "K-Store", slug: "k-store" },
      },
    ],
    total: 1,
    page: 1,
    limit: 24,
  };
  expect(productSearchResultSchema.safeParse(valid).success).toBe(true);
});

test("parses an empty result set", () => {
  const valid = { products: [], total: 0, page: 1, limit: 24 };
  expect(productSearchResultSchema.safeParse(valid).success).toBe(true);
});
